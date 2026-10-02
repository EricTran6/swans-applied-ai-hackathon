import { describe, it, expect } from "vitest";
import { findQuoteRange, splitByQuote, matchTextItems } from "./highlight";

describe("quote highlighter", () => {
  const text = "Jane called:\n  asked whether to keep   PT twice weekly. Next call Friday.";
  it("ignores case, whitespace and line breaks", () => {
    const r = findQuoteRange(text, "JANE CALLED: asked whether to keep PT twice weekly")!;
    expect(text.slice(r.start, r.end)).toBe("Jane called:\n  asked whether to keep   PT twice weekly");
  });
  it("handles smart quotes and dashes", () => {
    expect(findQuoteRange("It’s a “go” — now", "it's a \"go\" - now")).not.toBeNull();
  });
  it("returns null for missing or empty quote", () => {
    expect(findQuoteRange(text, "not here")).toBeNull();
    expect(findQuoteRange(text, null)).toBeNull();
    expect(findQuoteRange(text, "   ")).toBeNull();
  });
  it("splits into segments", () => {
    expect(splitByQuote("abc DEF ghi", "def")).toEqual([{ text: "abc ", hit: false }, { text: "DEF", hit: true }, { text: " ghi", hit: false }]);
    expect(splitByQuote("abc", "zzz")).toEqual([{ text: "abc", hit: false }]);
  });
  it("matches PDF text items across item boundaries", () => {
    const hit = matchTextItems(["Total", "billed", "charges:", "$10", "unrelated"], "billed charges: $10");
    expect([...hit].sort()).toEqual([1, 2, 3]);
  });
});
