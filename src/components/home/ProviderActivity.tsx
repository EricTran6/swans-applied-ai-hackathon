"use client";
import Link from "next/link";
import { Eye, MessageSquareReply } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, matterHref, replyText, type FeedEntry } from "./lib";
import { FOCUS } from "./TopBar";

export function ProviderActivity({ feed, now }: { feed: FeedEntry[]; now: number | null }) {
  return (
    <section aria-labelledby="provider-h" className="rounded-xl border border-line bg-white p-6">
      <h2 id="provider-h" className="font-serif text-xl font-semibold text-ink">Provider activity</h2>
      <p className="mt-1 text-[13px] text-ink-2">Opens and replies on curated shares, across matters.</p>
      {feed.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">No provider has opened a share yet. From any matter, use <span className="font-medium text-ink">Share with a provider</span> to send a curated view.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {feed.map(({ matter, activity }, i) => {
            const replied = activity.kind === "replied";
            const Icon = replied ? MessageSquareReply : Eye;
            return (
              <li key={`${matter.clioId}-${activity.at}-${i}`} className="flex gap-3">
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", replied ? "bg-info-bg text-info" : "bg-ok-bg text-ok")}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{activity.recipientLabel}</span> {replied ? "replied" : "opened"}
                    <span className="font-mono text-[12px] text-ink-2"> · {now != null ? formatClock(activity.at, now) : ""}</span>
                  </p>
                  {activity.reply && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2" title={replyText(activity.reply)}>“{replyText(activity.reply)}”</p>}
                  <Link href={`${matterHref(matter)}/share`} className={cn("mt-0.5 inline-block rounded text-[13px] text-navy underline-offset-4 hover:underline", FOCUS)}>
                    {matter.clientName}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
