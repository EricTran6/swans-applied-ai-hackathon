// CLI: sync one matter from Clio (GET only; or CLIO_FIXTURE_DIR), build the digest, save it, print summary + cost.
// Usage: npm run digest -- <matterId>     (or CLIO_MATTER_ID in .env)
import fs from "node:fs";
import { buildDigest } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { syncMatter } from "@/lib/ingest";
import type { AiCall, Digest, ExtractionCache, ExtractionKey, Matter } from "@/lib/types";

function loadEnv() {
  try { if (fs.existsSync(".env")) process.loadEnvFile(".env"); } catch { /* optional */ }
}

function dbCache(): ExtractionCache {
  const db = getDb();
  const get = db.prepare("SELECT facts_json FROM extractions WHERE source_type=? AND clio_id=? AND content_hash=? AND extractor_version=?");
  const set = db.prepare("INSERT OR REPLACE INTO extractions (source_type, clio_id, content_hash, extractor_version, facts_json, created_at) VALUES (?,?,?,?,?,?)");
  return {
    get(k: ExtractionKey) {
      const row = get.get(k.sourceType, k.clioId, k.contentHash, k.extractorVersion) as { facts_json: string } | undefined;
      return row ? JSON.parse(row.facts_json) : null;
    },
    set(k: ExtractionKey, v: unknown) {
      set.run(k.sourceType, k.clioId, k.contentHash, k.extractorVersion, JSON.stringify(v), new Date().toISOString());
    },
  };
}

function logAiCall(c: AiCall) {
  getDb().prepare("INSERT INTO ai_calls (matter_id, stage, model, input_tokens, output_tokens, cache_read_tokens, usd, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(c.matterId, c.stage, c.model, c.inputTokens, c.outputTokens, c.cacheReadTokens, c.usd, new Date().toISOString());
  console.error(`  ai: ${c.stage} ${c.model} in=${c.inputTokens} out=${c.outputTokens} $${c.usd.toFixed(4)}`);
}

function loadPrev(matterId: string): Digest | null {
  const row = getDb().prepare("SELECT digest_json FROM digests WHERE matter_id=? ORDER BY version DESC LIMIT 1").get(matterId) as { digest_json: string } | undefined;
  return row ? (JSON.parse(row.digest_json) as Digest) : null;
}

function saveDigest(d: Digest, synthVersion: string) {
  getDb().prepare("INSERT INTO digests (matter_id, version, input_set_hash, synth_version, digest_json, cost_usd, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(d.matterId, d.version, d.inputSetHash, synthVersion, JSON.stringify(d), d.meta.costUsd, d.createdAt);
}

async function main() {
  loadEnv();
  const matterId = process.argv[2] || process.env.CLIO_MATTER_ID;
  if (!matterId) { console.error("usage: npm run digest -- <matterId>"); process.exit(2); }

  const t0 = Date.now();
  console.error(`syncing matter ${matterId}${process.env.CLIO_FIXTURE_DIR ? ` (fixtures: ${process.env.CLIO_FIXTURE_DIR})` : ""}…`);
  const { records, events, documentTexts } = await syncMatter(matterId);
  const matter = records.find((r): r is Matter => r.sourceType === "matter");
  if (!matter) throw new Error("sync returned no matter record");
  console.error(`  ${records.length} records, ${events.length} change events, ${documentTexts.length} document texts`);

  const prev = loadPrev(matterId);
  const built = await buildDigest({ matter, records, docTexts: documentTexts, changeFeed: events, prev, cache: dbCache(), log: logAiCall, now: new Date() });
  const version = built.meta.cached ? (prev?.version ?? 1) : (prev?.version ?? 0) + 1;
  const digest: Digest = { ...built, version };
  if (!built.meta.cached) saveDigest(digest, built.meta.models.pipeline ?? "synth-v1");

  const h = digest.header;
  console.log(`\n${h.displayNumber} — ${h.description} [${h.status}]  v${version}${built.meta.cached ? " (unchanged, cached)" : ""}`);
  console.log(`stage: ${digest.stage.label}   items: ${digest.totalItems}   changes this sync: ${events.length}`);
  console.log("\nBRIEF");
  for (const c of digest.brief) console.log(`  • ${c.text}  (${c.refs.map((r) => r.drawerKey).join(", ")})`);
  console.log("\nKPIs");
  for (const k of digest.kpis) console.log(`  ${k.label}: ${k.display} [${k.status}]`);
  console.log("\nTOP TEN");
  for (const t of digest.topTen) console.log(`  ${t.rank}. ${t.title} — ${t.why}`);
  console.log(`\nINJURIES (${digest.injuries.length})`);
  for (const inj of digest.injuries) console.log(`  ${inj.name} [${inj.status}] ${inj.refs.map((r) => r.drawerKey).join(", ")}`);
  console.log(`\nOPEN QUESTIONS (${digest.openQuestions.length})`);
  for (const q of digest.openQuestions) console.log(`  ? ${q.text}`);
  if (digest.meta.warnings.length) { console.log("\nWARNINGS"); for (const w of digest.meta.warnings) console.log(`  ! ${w}`); }
  console.log(`\nmodels: ${JSON.stringify(digest.meta.models)}`);
  console.log(`dropped refs: ${digest.meta.droppedRefs}, dropped claims: ${digest.meta.droppedClaims}`);
  console.log(`cost this build: $${digest.meta.costUsd.toFixed(4)}   time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
