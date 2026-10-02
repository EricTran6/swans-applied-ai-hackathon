import { describe, expect, it } from "vitest";
import type { MatterOverview, OverviewDigest, OverviewShares } from "@/app/api/matters/overview/route";
import {
  activityFeed, attentionMeta, digestFooter, formatClock, gridMode, matterHref, miniValueBar, railIndex, replyText, todayTiles,
} from "./lib";

const shares = (over: Partial<OverviewShares> = {}): OverviewShares => ({ total: 0, opened: 0, lastViewedAt: null, latestReply: null, recent: [], ...over });
const digest = (over: Partial<OverviewDigest> = {}): OverviewDigest => ({
  version: 1, builtAt: "2026-10-02T11:48:00Z", costUsd: 0.14, stage: { key: "treatment", label: "Treating" }, kpis: [],
  overdue: 0, upcoming7d: 0, waiting: 0, newSinceOpen: 0, topAttention: [], ...over,
});
const mo = (id: string, d: OverviewDigest | null, s = shares()): MatterOverview => ({
  matter: { clioId: id, displayNumber: `000${id}`, description: "Synthetic", clientName: `Jane Doe ${id}`, status: "Open" }, digest: d, shares: s,
});

describe("todayTiles", () => {
  it("sums across matters and lists only contributing matters", () => {
    const tiles = todayTiles([
      mo("1", digest({ overdue: 2, upcoming7d: 1, waiting: 1 }), shares({ opened: 1 })),
      mo("2", null, shares({ opened: 2 })),
      mo("3", digest({ overdue: 1 })),
    ]);
    const by = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(tiles.map((t) => t.key)).toEqual(["overdue", "upcoming7d", "waiting", "sharesOpened"]);
    expect(by.overdue.total).toBe(3);
    expect(by.overdue.matters.map((m) => m.clioId)).toEqual(["1", "3"]);
    expect(by.upcoming7d).toMatchObject({ total: 1 });
    expect(by.waiting.matters.map((m) => m.clioId)).toEqual(["1"]);
    expect(by.sharesOpened.total).toBe(3);
  });
  it("is all zeros for no matters", () => {
    expect(todayTiles([]).every((t) => t.total === 0 && t.matters.length === 0)).toBe(true);
  });
});

describe("railIndex", () => {
  it("collapses litigation and resolution stages", () => {
    expect(railIndex("intake")).toBe(0);
    expect(railIndex("discovery")).toBe(railIndex("pleadings"));
    expect(railIndex("trial")).toBe(5);
    expect(railIndex("disbursement")).toBe(6);
    expect(railIndex("weird")).toBe(0);
    expect(railIndex(null)).toBe(0);
  });
});

describe("miniValueBar", () => {
  it("scales to the larger value and flags value above coverage", () => {
    expect(miniValueBar(200, 100)).toEqual({ valuePct: 100, capPct: 50, over: true });
    expect(miniValueBar(50, 100)).toEqual({ valuePct: 50, capPct: 100, over: false });
    expect(miniValueBar(null, 100)).toEqual({ valuePct: 0, capPct: 100, over: false });
    expect(miniValueBar(80, null)).toEqual({ valuePct: 100, capPct: null, over: false });
    expect(miniValueBar(null, null)).toBeNull();
  });
});

describe("text helpers", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("formats the digest footer", () => {
    expect(digestFooter({ version: 3, builtAt: "2026-10-02T11:48:00Z", costUsd: 0.14 }, now)).toBe("Digest v3 · built 12 min ago · $0.14");
  });
  it("describes attention rows", () => {
    const base = { title: "t", dueAt: null, daysLate: null, daysSilent: null, waitingOn: null, drawerKey: null };
    expect(attentionMeta({ ...base, kind: "overdue", daysLate: 12, dueAt: "2026-09-20" })).toBe("12 days late · due Sep 20");
    expect(attentionMeta({ ...base, kind: "overdue", daysLate: 1 })).toBe("1 day late");
    expect(attentionMeta({ ...base, kind: "waiting", waitingOn: "Provider A", daysSilent: 31 })).toBe("Waiting on Provider A · silent 31 days");
  });
  it("describes provider replies", () => {
    const r = { recipientLabel: "P", promisedDate: null, text: null, at: "" };
    expect(replyText({ ...r, kind: "will_send", promisedDate: "2026-10-09" })).toBe("Will send by Oct 9");
    expect(replyText({ ...r, kind: "sent" })).toBe("Marked as sent");
    expect(replyText({ ...r, kind: "note", text: "Call me" })).toBe("Call me");
  });
  it("shows a clock for today and a date otherwise", () => {
    expect(formatClock("2026-10-02T10:42:00Z", now, "UTC")).toBe("10:42");
    expect(formatClock("2026-09-12T10:42:00Z", now, "UTC")).toBe("Sep 12");
    expect(formatClock("nope", now, "UTC")).toBe("");
  });
  it("builds matter links and grid mode", () => {
    expect(matterHref({ clioId: "a/b" })).toBe("/matters/a%2Fb");
    expect(gridMode(1)).toBe("hero");
    expect(gridMode(0)).toBe("grid");
    expect(gridMode(4)).toBe("grid");
  });
});

describe("activityFeed", () => {
  it("merges matters newest first and caps", () => {
    const act = (at: string) => ({ kind: "opened" as const, recipientLabel: "P", at, reply: null });
    const feed = activityFeed([
      mo("1", null, shares({ recent: [act("2026-09-03"), act("2026-09-01")] })),
      mo("2", null, shares({ recent: [act("2026-09-02")] })),
    ], 2);
    expect(feed.map((f) => [f.matter.clioId, f.activity.at])).toEqual([["1", "2026-09-03"], ["2", "2026-09-02"]]);
  });
});
