"use client";
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { buildRespondBody, fmtDate, postRespond, type RespondBody } from "./logic";
import type { ProviderView } from "@/lib/types";

type Done = Record<string, string>;

function tomorrowIso(): string {
  return new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2";
const btnBase = `min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const btnPrimary = `${btnBase} bg-navy text-white hover:bg-navy/90 disabled:hover:bg-navy`;
const btnSecondary = `${btnBase} border border-line bg-white text-ink hover:bg-paper disabled:hover:bg-white`;
const field = `rounded-lg border border-line bg-white text-sm text-ink ${focusRing}`;

function Confirmed({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ok" role="status">
      <CircleCheck aria-hidden className="size-4 shrink-0" />
      {children}
    </p>
  );
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

  return (
    <section aria-labelledby="needs-h" className="rounded-xl border border-line bg-white p-4">
      <h2 id="needs-h" className="font-serif text-lg font-semibold text-ink">What we need from you</h2>
      {needs.length === 0 && <p className="mt-2 text-sm text-ink-2">Nothing outstanding right now.</p>}
      <ul className="mt-3 space-y-3">
        {needs.map((n) => (
          <li key={n.id} className="rounded-lg border border-line border-l-4 border-l-info bg-paper p-3">
            <p className="text-sm text-ink">{n.text}</p>
            {n.due && <p className="tabular mt-1 text-xs text-ink-3">Requested by {fmtDate(n.due)}</p>}
            {done[n.id] ? (
              <Confirmed>{done[n.id]}</Confirmed>
            ) : picking === n.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-sm text-ink" htmlFor={`d-${n.id}`}>Send by</label>
                <input id={`d-${n.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`min-h-11 px-2 ${field}`} />
                <button type="button" className={btnPrimary} onClick={() => send(n.id, buildRespondBody({ needId: n.id, kind: "will_send", promisedDate: date }), `Thanks, we will expect it by ${fmtDate(date)}`)}>Confirm</button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={disabled} className={btnPrimary} onClick={() => send(n.id, buildRespondBody({ needId: n.id, kind: "sent" }), "Marked as sent, thank you")}>Sent</button>
                <button type="button" disabled={disabled} className={btnSecondary} onClick={() => setPicking(n.id)}>Will send by…</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 rounded-lg bg-danger-bg p-2 text-sm text-danger" role="alert">{error}</p>}
      <form onSubmit={sendNote} className="mt-4 border-t border-line pt-4">
        <label htmlFor="provider-note" className="text-sm font-medium text-ink">Leave a note for the firm</label>
        <textarea id="provider-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={disabled} className={`mt-1 w-full p-2 placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50 ${field}`} placeholder="Questions, corrections, anything the firm should know" />
        <button type="submit" disabled={disabled || !note.trim() || noteState === "sending"} className={`${btnPrimary} mt-2 w-full`}>
          {noteState === "sending" ? "Sending…" : "Send note"}
        </button>
        {noteState === "sent" && <Confirmed>Note sent. Thank you.</Confirmed>}
        {noteState === "error" && <p className="mt-2 rounded-lg bg-danger-bg p-2 text-sm text-danger" role="alert">Could not send. Please try again.</p>}
      </form>
    </section>
  );
}
