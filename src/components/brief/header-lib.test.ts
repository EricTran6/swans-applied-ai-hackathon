import { describe, expect, it } from "vitest";
import {
  cleanWarning, costLabel, coverageBarCaption, footerLine, groupWarnings, resolveCap, stageName, syncLabel, uniqueModels, warningsSummary,
} from "./header-lib";

const NOW = Date.parse("2026-01-10T12:00:00Z");
const API = 'extract_injuries: API error (400 {"type":"error","error":{"type":"invalid_request_error","message":"credit balance too low"}})';

describe("syncLabel", () => {
  it("uses the sync run when present", () => {
    expect(syncLabel({ lastSyncedAt: "2026-01-10T11:55:00Z", builtAt: "2026-01-10T08:00:00Z", now: NOW })).toBe("Last synced 5 min ago");
  });
  it("falls back to built time instead of 'never'", () => {
    expect(syncLabel({ lastSyncedAt: null, builtAt: "2026-01-10T10:00:00Z", now: NOW })).toBe("Built 2 h ago");
  });
  it("has a neutral last resort", () => {
    expect(syncLabel({ lastSyncedAt: null, builtAt: undefined, now: NOW })).toBe("Not synced yet");
  });
});

describe("costLabel", () => {
  it("separates this open from build cost", () => {
    expect(costLabel({ costUsd: 1.234, cached: true })).toBe("This open: $0.00 (cached) · built for $1.23");
    expect(costLabel({ costUsd: 0.5, cached: false })).toBe("This open: $0.50 (fresh build)");
  });
});

describe("warnings", () => {
  const ws = ["extract_facts: API error (500)", API, API, API, API, API, "synthesize: API error (overloaded)"];
  it("normalizes stage names", () => {
    expect(stageName("extract_injuries")).toBe("injuries");
    expect(stageName("synthesize")).toBe("synthesis");
  });
  it("strips API error JSON", () => {
    expect(cleanWarning(API)).toBe("extract_injuries: API error (400)");
    expect(cleanWarning(API)).not.toMatch(/[{}]/);
  });
  it("groups by stage and dedupes details", () => {
    const g = groupWarnings(ws);
    expect(g.map((x) => [x.stage, x.count])).toEqual([["facts", 1], ["injuries", 5], ["synthesis", 1]]);
    expect(g[1].details).toHaveLength(1);
  });
  it("summarises on one line", () => {
    expect(warningsSummary(ws)).toBe("AI step failed: facts, injuries ×5, synthesis");
    expect(warningsSummary(["synthesize: 2/9 refs dropped after retry"])).toBe("AI notes: synthesis");
    expect(warningsSummary([])).toBe("");
  });
});

describe("footer + coverage", () => {
  it("dedupes models and shows version once", () => {
    expect(uniqueModels({ a: "claude-x", b: "claude-x", c: "claude-y" })).toEqual(["claude-x", "claude-y"]);
    expect(footerLine({ version: 3, meta: { builtAt: "2026-01-10", models: { a: "m", b: "m" }, droppedRefs: 0 } }, (d) => d)).toBe("Pipeline v3 · built 2026-01-10 · m");
  });
  it("resolves the cap with fallbacks", () => {
    expect(resolveCap(100, 200, [])).toBe(100);
    expect(resolveCap(null, 200, [])).toBe(200);
    expect(resolveCap(null, null, [{ kind: "Other", perPerson: 5 }, { kind: "BI", perPerson: 50 }])).toBe(50);
    expect(resolveCap(null, null, [{ kind: "Other", perPerson: 5 }, { kind: "Umbrella", perPerson: 9 }, { kind: "MedPay", perPerson: 99, exhausted: true }])).toBe(9);
    expect(resolveCap(null, null, [])).toBeNull();
  });
  it("labels unknown cap", () => {
    expect(coverageBarCaption(null)).toBe("cap unknown");
    expect(coverageBarCaption(250000)).toBe("Cap $250,000");
  });
});
