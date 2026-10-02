import { describe, expect, it } from "vitest";
import { crumbsFor } from "./crumbs";

describe("crumbsFor", () => {
  it("returns a single current crumb for home", () => {
    expect(crumbsFor("/")).toEqual([{ label: "All matters", href: null }]);
  });
  it("returns All matters / Brief for a matter", () => {
    expect(crumbsFor("/matters/123")).toEqual([
      { label: "All matters", href: "/" },
      { label: "Brief", href: null },
    ]);
  });
  it("returns three crumbs for share with Brief linked", () => {
    expect(crumbsFor("/matters/123/share")).toEqual([
      { label: "All matters", href: "/" },
      { label: "Brief", href: "/matters/123" },
      { label: "Share with a provider", href: null },
    ]);
  });
  it("tolerates trailing slashes", () => {
    expect(crumbsFor("/matters/123/share/")).toHaveLength(3);
  });
  it("falls back for unknown paths", () => {
    expect(crumbsFor("/connect")).toEqual([{ label: "All matters", href: null }]);
    expect(crumbsFor("/matters/1/other")).toHaveLength(1);
  });
});
