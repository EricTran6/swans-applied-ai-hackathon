import { describe, it, expect } from "vitest";
import type { Contact } from "@/lib/types";
import { MAX_ROLE_LABEL, roleLabel } from "./scope";

const c = (role: string | null): Contact => ({ role } as Contact);

describe("roleLabel", () => {
  it("drops the generic prefix and keeps the specialty", () => {
    expect(roleLabel(c("Treating provider, physical therapy"))).toBe("Physical therapy");
    expect(roleLabel(c("Treating provider"))).toBe("Treating provider");
    expect(roleLabel(c(null))).toBe("Treating provider");
    expect(roleLabel(undefined)).toBe("Treating provider");
  });
  it("never splits inside parentheses and keeps them balanced", () => {
    expect(roleLabel(c("physiatry (A. Person, M.D.)"))).toBe("Physiatry (A. Person, M.D.)");
    expect(roleLabel(c("Treating provider, physiatry (A. Person, M.D.)"))).toBe("Physiatry (A. Person, M.D.)");
    expect(roleLabel(c("Treating provider (pain management), spine"))).toBe("Spine");
  });
  it("caps the label at 60 characters without leaving an unclosed parenthesis", () => {
    const long = `Treating provider, ${"orthopaedic surgery and ".repeat(3)}(${"a".repeat(40)})`;
    const out = roleLabel(c(long));
    expect(out.length).toBeLessThanOrEqual(MAX_ROLE_LABEL);
    expect(out).not.toMatch(/\(/);
    const inside = `${"neurology ".repeat(5)}(${"b".repeat(30)}) tail`;
    const out2 = roleLabel(c(inside));
    expect(out2.length).toBeLessThanOrEqual(MAX_ROLE_LABEL);
    expect((out2.match(/\(/g) ?? []).length).toBe((out2.match(/\)/g) ?? []).length);
    expect(out2).not.toMatch(/[\s,(-]$/);
  });
});
