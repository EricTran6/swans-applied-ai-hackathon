// Sync + digest orchestration. The only place (besides /api/matters) that triggers Clio reads is syncMatter.
import { buildDigest, isReusable } from "@/lib/ai";
import { inputSetHash } from "@/lib/digest";
import { repos } from "@/lib/db";
import { getDocumentText, loadRecords, syncMatter } from "@/lib/ingest";
import type { AiCall, ClioRecord, DocumentText, Matter } from "@/lib/types";
import { logError } from "./http";

export class NotSyncedError extends Error {}

const STALE_RUN_MS = 10 * 60 * 1000;
const inFlight = new Set<string>();

export interface DigestResult { version: number; changed: number; costUsd: number; durationMs: number; unchanged: boolean }

function docTextsFor(records: ClioRecord[]): DocumentText[] {
  const out: DocumentText[] = [];
  for (const r of records) {
    if (r.sourceType !== "document") continue;
    const t = getDocumentText(r.clioId);
    if (t) out.push(t);
  }
  return out;
}

/** Build and store a digest from the DB-cached records (never Clio). No-op when inputs are unchanged and !force. */
export async function buildAndStoreDigest(matterId: string, opts: { force?: boolean; docTexts?: DocumentText[] } = {}): Promise<DigestResult> {
  const t0 = Date.now();
  const r = repos();
  const records = loadRecords(matterId);
  const matter = records.find((x): x is Matter => x.sourceType === "matter");
  if (!matter) throw new NotSyncedError("matter not synced");
  const prev = r.digests.latest(matterId);
  const hash = inputSetHash(records);
  const sinceIso = prev?.createdAt ?? "";
  const changeFeed = r.events.listAfter(matterId, sinceIso);
  if (!opts.force && isReusable(prev, hash)) {
    return { version: prev.version, changed: 0, costUsd: 0, durationMs: Date.now() - t0, unchanged: true };
  }
  let costUsd = 0;
  const log = (c: AiCall) => {
    costUsd += c.usd;
    r.aiCalls.insert({ ...c, matterId: c.matterId ?? matterId }, new Date().toISOString());
  };
  const built = await buildDigest({
    matter, records, docTexts: opts.docTexts ?? docTextsFor(records), changeFeed, prev: opts.force ? null : prev,
    cache: r.extractions.asCache(), log, now: new Date(),
  });
  const stored = r.digests.insert(built, "v1", costUsd);
  return { version: stored.version, changed: changeFeed.length, costUsd, durationMs: Date.now() - t0, unchanged: false };
}

/** Start a sync run unless one is already active. Returns the run id; the work continues in the background. */
export function startSync(matterId: string): { runId: number; alreadyRunning: boolean } {
  const r = repos();
  const latest = r.syncRuns.latest(matterId);
  const active = latest && (latest.state === "syncing" || latest.state === "digesting")
    && Date.now() - Date.parse(latest.startedAt) < STALE_RUN_MS;
  if (active && inFlight.has(matterId)) return { runId: latest.id, alreadyRunning: true };
  const runId = r.syncRuns.start(matterId, "syncing", new Date().toISOString());
  inFlight.add(matterId);
  void (async () => {
    try {
      const { documentTexts } = await syncMatter(matterId);
      r.syncRuns.update(runId, "digesting", null, null);
      await buildAndStoreDigest(matterId, { docTexts: documentTexts });
      r.syncRuns.update(runId, "idle", null, new Date().toISOString());
    } catch (err) {
      logError("sync", err);
      r.syncRuns.update(runId, "error", err instanceof Error ? err.message.slice(0, 200) : "sync failed", new Date().toISOString());
    } finally {
      inFlight.delete(matterId);
    }
  })();
  return { runId, alreadyRunning: false };
}

export function syncStatus(matterId: string): import("@/lib/types").SyncStatus {
  const r = repos();
  const latest = r.syncRuns.latest(matterId);
  let state: import("@/lib/types").SyncStatus["state"] = "idle";
  let message: string | null = null;
  if (latest) {
    message = latest.message;
    if (latest.state === "syncing" || latest.state === "digesting") {
      const stale = Date.now() - Date.parse(latest.startedAt) > STALE_RUN_MS || !inFlight.has(matterId);
      if (stale) { state = "error"; message = "sync did not finish"; } else state = latest.state;
    } else if (latest.state === "error") state = "error";
  }
  const digest = r.digests.latest(matterId);
  return {
    matterId, state, message,
    lastSyncedAt: r.syncRuns.lastCompleted(matterId)?.finishedAt ?? null,
    lastDigestAt: digest?.createdAt ?? null,
  };
}
