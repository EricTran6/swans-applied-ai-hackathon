"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { crumbsFor } from "./crumbs";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export function AppHeader() {
  const crumbs = crumbsFor(usePathname() ?? "/");
  return (
    <header className="print:hidden border-b border-line bg-paper">
      <div className="mx-auto flex min-h-12 w-full max-w-[1360px] items-center gap-x-4 gap-y-1 px-4 sm:px-6">
        <Link href="/" className={`shrink-0 rounded font-serif text-lg font-semibold text-ink ${FOCUS}`}>
          Case Lens
        </Link>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-2">
            {crumbs.map((c, i) => (
              <li key={c.label} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                {c.href ? (
                  <Link href={c.href} className={`rounded hover:text-navy hover:underline ${FOCUS}`}>
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-ink">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </header>
  );
}
