import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyRecords, configureIngest, getDocumentFilePath, getDocumentText, loadRecords, syncMatter } from "./index";

const ROOT = path.resolve(__dirname, "../../..");
const SCHEMA = fs.readFileSync(path.join(ROOT, "src/lib/db/schema.sql"), "utf8");
const BOP = path.join(ROOT, "fixtures/documents/bill-of-particulars-sample.pdf");

function setupFixtureDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t01-clio-"));
  for (const f of fs.readdirSync(path.join(ROOT, "fixtures/clio"))) fs.copyFileSync(path.join(ROOT, "fixtures/clio", f), path.join(dir, f));
  // Place the sample PDF where scripts/clio_dump.py would have saved the BoP document.
  const docs = JSON.parse(fs.readFileSync(path.join(dir, "documents.json"), "utf8")) as { id: number; filename: string }[];
  const bop = docs.find((d) => /particulars/.test(d.filename))!;
  fs.mkdirSync(path.join(dir, "documents"));
  fs.copyFileSync(BOP, path.join(dir, "documents", `${bop.id}_${bop.filename}`));
  return dir;
}

describe("syncMatter", () => {
  let db: Database.Database;
  let dir: string;
  let docsDir: string;
  let clock = 0;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(SCHEMA);
    dir = setupFixtureDir();
    docsDir = fs.mkdtempSync(path.join(os.tmpdir(), "t01-docs-"));
    configureIngest({ db, docsDir, now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString() });
    vi.stubEnv("CLIO_FIXTURE_DIR", dir);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no network"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
    configureIngest({ db: null, docsDir: null });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(docsDir, { recursive: true, force: true });
  });

  const eventCount = () => (db.prepare("SELECT COUNT(*) n FROM item_events").get() as { n: number }).n;

  it("first sync stores every record as new; a second sync with no changes writes no events", async () => {
    const first = await syncMatter("x");
    expect(first.events.length).toBe(first.records.length);
    expect(first.events.every((e) => e.kind === "new")).toBe(true);
    expect(eventCount()).toBe(first.records.length);
    const matterId = first.records.find((r) => r.sourceType === "matter")!.clioId;
    expect(loadRecords(matterId)).toHaveLength(first.records.length);

    const second = await syncMatter("x");
    expect(second.events).toEqual([]);
    expect(eventCount()).toBe(first.records.length);
  });

  it("extracts per-page text for the PDF it has, caches the file and records its path", async () => {
    const { documentTexts, records } = await syncMatter("x");
    expect(documentTexts).toHaveLength(1);
    const t = documentTexts[0];
    expect(t.pageCount).toBe(3);
    expect(t.pages[2]).toContain("TEAR OF THE MEDIAL MENISCUS");
    expect(getDocumentText(t.clioId)?.pages[2]).toContain("TEAR OF THE MEDIAL MENISCUS");
    const file = getDocumentFilePath(t.clioId)!;
    expect(file.startsWith(docsDir)).toBe(true);
    expect(path.basename(file)).toBe(`${t.clioId}-${t.versionUuid}.pdf`);
    const row = db.prepare("SELECT file_path FROM document_texts WHERE clio_id = ?").get(t.clioId) as { file_path: string };
    expect(row.file_path).toBe(file);
    const doc = records.find((r) => r.drawerKey === `document:${t.clioId}`);
    expect(doc && doc.sourceType === "document" && doc.pageCount).toBe(3);
    // missing files are skipped, not fatal
    expect(getDocumentText("999999")).toBeNull();
  });

  it("writes changed and deleted events by content hash, ignoring updated_at", async () => {
    await syncMatter("x");
    const notesPath = path.join(dir, "notes.json");
    const notes = JSON.parse(fs.readFileSync(notesPath, "utf8")) as Record<string, unknown>[];
    notes[0].updated_at = "2031-01-01T00:00:00Z";           // touch only: no event
    notes[1].detail = `${notes[1].detail} Follow-up added.`; // content change
    const removed = notes.pop()!;                             // deletion
    fs.writeFileSync(notesPath, JSON.stringify(notes));
    const { events } = await syncMatter("x");
    expect(events.map((e) => [e.kind, e.clioId])).toEqual([["changed", String(notes[1].id)], ["deleted", String(removed.id)]]);
    expect(events[0].drawerKey).toBe(`note:${notes[1].id}`);
    const row = db.prepare("SELECT prev_hash, content_hash FROM item_events WHERE kind = 'changed'").get() as { prev_hash: string; content_hash: string };
    expect(row.prev_hash).not.toBe(row.content_hash);

    // restored record comes back as new
    notes.push(removed);
    fs.writeFileSync(notesPath, JSON.stringify(notes));
    const again = await syncMatter("x");
    expect(again.events.map((e) => e.kind)).toEqual(["new"]);
  });

  it("applyRecords is idempotent for identical input", () => {
    const rec = { sourceType: "task", clioId: "1", matterId: "m", title: "t", sourceDate: null, drawerKey: "task:1", etag: null, contentHash: "h" };
    expect(applyRecords("m", [rec as never])).toHaveLength(1);
    expect(applyRecords("m", [rec as never])).toHaveLength(0);
  });
});
