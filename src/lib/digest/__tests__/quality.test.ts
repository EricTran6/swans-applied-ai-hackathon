// Digest quality rules (R1): milestones, categories, filename humanizing, thread de-dup, waiting-on window.
import { describe, expect, it } from "vitest";
import { computeDeterministic } from "@/lib/digest";
import { actionBoard } from "@/lib/digest/actions";
import { topTen } from "@/lib/digest/rank";
import { buildTimeline, MAX_MILESTONES } from "@/lib/digest/timeline";
import { addDays, humanizeFilename, stripReplyPrefix } from "@/lib/digest/util";
import type { CalendarEntry, ClioRecord, Communication, Contact, Note, Party, Task } from "@/lib/types";
import { fixtureRecords } from "./fixture-records";

const now = new Date("2026-10-02T12:00:00Z");
const today = "2026-10-02";
let seq = 1;
const fx = () => fixtureRecords();
const pick = <T extends ClioRecord>(records: ClioRecord[], key: string) => records.find((r) => r.drawerKey === key) as T;

function cal(records: ClioRecord[], summary: string, date: string): CalendarEntry {
  const id = `9${seq++}`;
  return { ...pick<CalendarEntry>(records, "calendar_entry:100062"), clioId: id, drawerKey: `calendar_entry:${id}`,
    title: summary, summary, description: "", startAt: `${date}T09:00:00-07:00`, sourceDate: `${date}T09:00:00-07:00` };
}
function note(records: ClioRecord[], subject: string, date: string, body = ""): Note {
  const id = `9${seq++}`;
  return { ...pick<Note>(records, "note:100014"), clioId: id, drawerKey: `note:${id}`, title: subject, subject,
    bodyText: body, date, sourceDate: date };
}
const FIRM: Party = { contactId: null, name: "Alex Counsel", kind: "User" };
function comm(records: ClioRecord[], subject: string, date: string, senders: Party[], receivers: Party[], body = "", kind = "Email"): Communication {
  const id = `9${seq++}`;
  return { ...pick<Communication>(records, "communication:100032"), clioId: id, drawerKey: `communication:${id}`,
    title: subject, subject, bodyText: body, occurredAt: date, sourceDate: date, senders, receivers, kind };
}
const partyOf = (c: Contact): Party => ({ contactId: c.clioId, name: c.name, kind: c.kind });

describe("milestones", () => {
  it("no communication is ever a milestone, even when its subject names an event", () => {
    const { matter, records } = fx();
    const ortho = pick<Contact>(records, "contact:810002");
    const recs = [...records, comm(records, "Suit filed and served", "2025-03-02", [FIRM], [partyOf(ortho)]),
      comm(records, "RE: Coverage confirmed", "2026-09-06", [FIRM], [partyOf(ortho)], "limits confirmed in writing")];
    const t = buildTimeline(matter, recs);
    expect(t.filter((e) => e.refs[0].sourceType === "communication").some((e) => e.milestone)).toBe(false);
  });
  it("talk about an event is not the event: calls, notices, proposed dates, reviews, status notes", () => {
    const { matter, records } = fx();
    const extra = [
      note(records, "IME notice", "2026-08-01"),
      note(records, "Compliance conference: proposed dates", "2026-08-02"),
      cal(records, "Call to the client ahead of the conference", "2026-08-03"),
      note(records, "Client check-in call", "2026-08-04"),
      note(records, "File review: compliance conference prep", "2026-08-05"),
      note(records, "Case status: conference pending", "2026-08-06"),
    ];
    const t = buildTimeline(matter, [...records, ...extra]);
    const ids = new Set(extra.map((r) => r.clioId));
    expect(t.filter((e) => ids.has(e.refs[0].clioId)).every((e) => !e.milestone)).toBe(true);
    // The real events still are milestones.
    expect(t.filter((e) => e.milestone).map((e) => e.date)).toEqual(
      expect.arrayContaining(["2024-03-10", "2024-03-15", "2024-06-04", "2025-03-01", "2026-09-05", "2026-10-21"]));
  });
  it("same kind within 14 days collapses to the earliest", () => {
    const { matter, records } = fx();
    const a = cal(records, "Deposition of defendant", "2026-05-01");
    const b = cal(records, "Deposition of client", "2026-05-10");
    const t = buildTimeline(matter, [...records, a, b]);
    expect(t.find((e) => e.refs[0].clioId === a.clioId)!.milestone).toBe(true);
    expect(t.find((e) => e.refs[0].clioId === b.clioId)!.milestone).toBe(false);
  });
  it("status and decision notes are not surgery milestones; a recommendation or performed surgery is", () => {
    const { matter, records } = fx();
    const status = [
      note(records, "Knee surgery still has no date", "2022-02-01"),
      note(records, "The second surgery is now the biggest open question", "2022-03-01"),
      cal(records, "Client appointment: treatment and surgery decision", "2022-04-01"),
    ];
    const real = [note(records, "Hip surgery recommended", "2022-06-01"), note(records, "Post-operative: shoulder arthroscopy performed", "2022-09-01")];
    const t = buildTimeline(matter, [...records, ...status, ...real]);
    const on = (rs: ClioRecord[]) => t.filter((e) => rs.some((r) => r.clioId === e.refs[0].clioId));
    expect(on(status).some((e) => e.milestone)).toBe(false);
    expect(on(real).every((e) => e.milestone)).toBe(true);
  });
  it("a collapse window keeps the calendar entry (the event) over an earlier authorisation note", () => {
    const { matter, records } = fx();
    const auth = note(records, "Shoulder surgery authorised", "2022-05-01");
    const done = cal(records, "Shoulder arthroscopy, Example Surgery Center", "2022-05-15");
    const t = buildTimeline(matter, [...records, auth, done]);
    expect(t.find((e) => e.refs[0].clioId === done.clioId)!.milestone).toBe(true);
    expect(t.find((e) => e.refs[0].clioId === auth.clioId)!.milestone).toBe(false);
  });
  it("preferring the event does not chain: surgeries far apart both stay", () => {
    const { matter, records } = fx();
    const a = note(records, "Shoulder surgery authorised", "2022-05-01");
    const b = cal(records, "Shoulder arthroscopy", "2022-05-10");
    const c = note(records, "Second surgery recommended", "2022-06-05");
    const d = cal(records, "Knee arthroscopy", "2022-08-01");
    const t = buildTimeline(matter, [...records, a, b, c, d]);
    const ms = (r: ClioRecord) => t.find((e) => e.refs[0].clioId === r.clioId)!.milestone;
    expect([ms(a), ms(b), ms(c), ms(d)]).toEqual([false, true, true, true]);
  });
  it("retention may come from a communication (once), no other kind may", () => {
    const { matter, records } = fx();
    const ortho = pick<Contact>(records, "contact:810002");
    const r1 = comm(records, "Retainer agreement and HIPAA authorization", "2000-01-05", [FIRM], [partyOf(ortho)]);
    const r2 = comm(records, "Signed retainer returned", "2000-01-09", [partyOf(ortho)], [FIRM]);
    const noConsult = records.filter((r) => !/consult/i.test(r.title)); // the fixture's own retention entry
    const t = buildTimeline(matter, [...noConsult, r1, r2]);
    const ms = (r: ClioRecord) => t.find((e) => e.refs[0].clioId === r.clioId)!.milestone;
    expect([ms(r1), ms(r2)]).toEqual([true, false]);
  });
  it("caps milestones at 12, keeping the highest-priority kinds", () => {
    const { matter, records } = fx();
    const many = Array.from({ length: 30 }, (_, i) => cal(records, "Compliance conference", addDays("2024-01-01", i * 30)));
    const t = buildTimeline(matter, [...records, ...many]);
    const ms = t.filter((e) => e.milestone);
    expect(ms.length).toBe(MAX_MILESTONES);
    expect(ms.map((e) => e.date)).toEqual(expect.arrayContaining(["2024-03-10", "2024-03-15", "2024-06-04", "2025-03-01", "2026-09-05"]));
  });
});

describe("timeline categories", () => {
  const cat = (extra: ClioRecord[], contacts: Contact[] = []) => {
    const { matter, records } = fx();
    const t = buildTimeline(matter, [...records, ...contacts, ...extra]);
    return (r: ClioRecord) => t.find((e) => e.refs[0].clioId === r.clioId)!.category;
  };
  it("ordered rules: legal before money before treatment", () => {
    const { records } = fx();
    const a = note(records, "Client appointment: updated employment and commission records", "2026-08-01");
    const b = note(records, "File review: compliance conference before the judge", "2026-08-02");
    const c = note(records, "Obtain updated employment and commission records", "2026-08-03");
    const d = note(records, "Right shoulder surgical date", "2026-08-04", "bill attached");
    const of = cat([a, b, c, d]);
    expect([of(a), of(b), of(c), of(d)]).toEqual(["money", "legal", "money", "treatment"]);
  });
  it("a provider name containing a money word does not decide the category", () => {
    const { records } = fx();
    const prov: Contact = { ...pick<Contact>(records, "contact:810002"), clioId: "9777", drawerKey: "contact:9777",
      name: "Ledger Billing Orthopaedics PLLC", title: "Ledger Billing Orthopaedics PLLC" };
    const a = comm(records, "Call to Ledger Billing Orthopaedics re right shoulder surgical date", "2026-08-01",
      [FIRM], [partyOf(prov)], "", "Phone");
    const b = note(records, "Spoke with Ledger Billing Orthopaedics", "2026-08-02");
    const of = cat([a, b], [prov]);
    expect(of(a)).toBe("treatment");
    expect(of(b)).not.toBe("money");
  });
  it("an RE: reply shares its parent's category", () => {
    const { records } = fx();
    const ortho = partyOf(pick<Contact>(records, "contact:810002"));
    const a = comm(records, "Chaser: outstanding items", "2026-08-01", [FIRM], [ortho], "Please send the MRI.");
    const b = comm(records, "RE: Chaser: outstanding items", "2026-08-05", [ortho], [FIRM], "Attached is our ledger.");
    const of = cat([a, b]);
    expect(of(a)).toBe("treatment");
    expect(of(b)).toBe(of(a));
  });
});

describe("filenames", () => {
  it("humanizes raw document filenames", () => {
    expect(humanizeFilename("08-experts__doc-47__radiology-review-smith.pdf")).toBe("Radiology review smith");
    expect(humanizeFilename("02-pleadings__bill-of-particulars.pdf")).toBe("Bill of particulars");
    expect(humanizeFilename("03_doc-12_intake_form.PDF")).toBe("Intake form");
    expect(humanizeFilename("Signed retainer")).toBe("Signed retainer");
  });
  it("document timeline events and top-ten items show humanized names", () => {
    const { matter, records } = fx();
    const t = buildTimeline(matter, records);
    const doc = t.find((e) => e.refs[0].drawerKey === "document:100076")!;
    expect(doc.title).toBe("Bill of particulars");
    expect(t.some((e) => /\.pdf$|__/.test(e.title))).toBe(false);
  });
  it("strips reply prefixes", () => {
    expect(stripReplyPrefix("RE: Fwd: FW: Chaser: x")).toBe("Chaser: x");
  });
});

describe("top ten threads", () => {
  it("keeps one entry per thread", () => {
    const { records } = fx();
    const adj = partyOf(pick<Contact>(records, "contact:820003"));
    const recs = [...records,
      note(records, "Coverage confirmed in writing", "2026-09-30", "Limits $250,000 confirmed."),
      comm(records, "RE: Coverage confirmation", "2026-10-01", [adj], [FIRM], "Confirming coverage limits."),
      comm(records, "Chaser: lien ledger", "2026-09-29", [FIRM], [adj], "Please send the lien ledger, $1,000."),
      comm(records, "RE: Chaser: lien ledger", "2026-09-30", [adj], [FIRM], "Lien ledger to follow, $1,000.")];
    const top = topTen(recs, today, "Jane Doe");
    expect(top.length).toBe(10);
    const topics = top.map((r) => stripReplyPrefix(r.title).toLowerCase().split(/\W+/).slice(0, 2).join(" ").replace(/confirm\w*/, "confirm"));
    expect(new Set(topics).size).toBe(top.length);
    expect(top.find((r) => /employment records/i.test(r.title))?.category ?? "money").toBe("money");
    // Fixture "Records request" + two "RE: Records request" -> at most one.
    expect(top.filter((r) => /records request/i.test(r.title)).length).toBeLessThanOrEqual(1);
  });
});

describe("waiting on", () => {
  const board = (recs: ClioRecord[]) => actionBoard(fx().matter, recs, now);
  it("a fresh unanswered request appears, and is not repeated under upcoming", () => {
    const b = board(fx().records);
    const ledger = b.waiting.find((a) => a.id === "task:100052")!;
    expect(ledger.waitingOn).toMatchObject({ contactId: "810001", requests: 1, daysSilent: 22 });
    expect(b.upcoming.map((a) => a.id)).not.toContain("task:100052");
  });
  it("an old answered request cycle does not count toward the current one", () => {
    const { records } = fx();
    const harbor = partyOf(pick<Contact>(records, "contact:810003"));
    const task: Task = { ...pick<Task>(records, "task:100052"), clioId: "9555", drawerKey: "task:9555",
      name: "By medical provider: Harbor Chiropractic - records", title: "By medical provider: Harbor Chiropractic - records",
      dueAt: "2026-12-01", sourceDate: "2026-12-01" };
    const old = [
      comm(records, "Records", "2024-01-01", [FIRM], [harbor]),
      comm(records, "Records", "2024-02-01", [FIRM], [harbor]),
      comm(records, "Records", "2024-03-01", [FIRM], [harbor]),
      comm(records, "RE: Records", "2024-03-20", [harbor], [FIRM]),
      comm(records, "Records", "2024-06-01", [FIRM], [harbor]), // unanswered but long outside the window
    ];
    expect(board([...records, task, ...old]).waiting.some((a) => a.id === "task:9555")).toBe(false);
    const fresh = comm(records, "Records again", "2026-09-26", [FIRM], [harbor]);
    const w = board([...records, task, ...old, fresh]).waiting.find((a) => a.id === "task:9555")!;
    expect(w.waitingOn).toMatchObject({ requests: 1, daysSilent: 6 });
  });
  it("a reply inside the window resets the count", () => {
    const { records } = fx();
    const lv = partyOf(pick<Contact>(records, "contact:810002"));
    const reply = comm(records, "RE: Records request", "2026-09-15", [lv], [FIRM]);
    expect(board([...records, reply]).waiting.some((a) => a.id === "task:100048")).toBe(false);
  });
});

describe("whole digest", () => {
  it("strip, top ten and board stay coherent on the fixture", () => {
    const { matter, records } = fx();
    const d = computeDeterministic({ matter, records, facts: null, changeFeed: [], now });
    expect(d.timeline.filter((e) => e.milestone).length).toBeLessThanOrEqual(MAX_MILESTONES);
    const waitIds = new Set(d.actionBoard.waiting.map((a) => a.id));
    expect(d.actionBoard.upcoming.some((a) => waitIds.has(a.id))).toBe(false);
  });
});
