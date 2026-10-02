"use client";
import { useState } from "react";
import { buildRespondBody, fmtDate, postRespond, type RespondBody } from "./logic";
import type { ProviderView } from "@/lib/types";

type Done = Record<string, string>;

function tomorrowIso(): string {
  return new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
}

export function Needs({ needs, token }: { needs: ProviderView["needs"]; token?: string }) {
  const [done, setDone] = useState<Done>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [date, setDate] = useState(tomorrowIso());
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const disabled = !token;

  async function send(id: string, body: RespondBody, label: string) {
    setError(null);
    if (!token) return;
    const ok = await postRespond(token, body);
    if (ok) {
      setDone((d) => ({ ...d, [id]: label }));
      setPicking(null);
    } else setError("Could not send your reply. Please try again.");
  }

  async function sendNote(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !note.trim()) return;
    setNoteState("sending");
    const ok = await postRespond(token, buildRespondBody({ kind: "note", text: note }));
    setNoteState(ok ? "sent" : "error");
    if (ok) setNote("");
  }

  const btn = "min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium disabled:opacity-50";

  return (
    <section aria-labelledby="needs-h" className="rounded-xl border bg-card p-4">
      <h2 id="needs-h" className="text-base font-semibold">What we need from you</h2>
      {needs.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing outstanding right now.</p>}
      <ul className="mt-3 space-y-3">
        {needs.map((n) => (
          <li key={n.id} className="rounded-lg border p-3">
            <p className="text-sm">{n.text}</p>
            {n.due && <p className="mt-1 text-xs text-muted-foreground">Requested by {fmtDate(n.due)}</p>}
            {done[n.id] ? (
              <p className="mt-2 text-sm font-medium text-emerald-700" role="status">{done[n.id]}</p>
            ) : picking === n.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-sm" htmlFor={`d-${n.id}`}>Send by</label>
                <input id={`d-${n.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11 rounded-lg border px-2 text-sm" />
                <button type="button" className={`${btn} bg-primary text-primary-foreground`} onClick={() => send(n.id, buildRespondBody({ needId: n.id, kind: "will_send", promisedDate: date }), `Thanks, we will expect it by ${fmtDate(date)}`)}>Confirm</button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={disabled} className={`${btn} bg-primary text-primary-foreground`} onClick={() => send(n.id, buildRespondBody({ needId: n.id, kind: "sent" }), "Marked as sent, thank you")}>Sent</button>
                <button type="button" disabled={disabled} className={btn} onClick={() => setPicking(n.id)}>Will send by…</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      <form onSubmit={sendNote} className="mt-4">
        <label htmlFor="provider-note" className="text-sm font-medium">Leave a note for the firm</label>
        <textarea id="provider-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={disabled} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder="Questions, corrections, anything the firm should know" />
        <button type="submit" disabled={disabled || !note.trim() || noteState === "sending"} className={`${btn} mt-2 w-full bg-primary text-primary-foreground`}>
          {noteState === "sending" ? "Sending…" : "Send note"}
        </button>
        {noteState === "sent" && <p className="mt-2 text-sm text-emerald-700" role="status">Note sent. Thank you.</p>}
        {noteState === "error" && <p className="mt-2 text-sm text-destructive" role="alert">Could not send. Please try again.</p>}
      </form>
    </section>
  );
}
