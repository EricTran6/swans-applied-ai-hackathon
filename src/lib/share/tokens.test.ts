import { describe, it, expect } from "vitest";
import { hashToken, newShareToken, verifyToken } from "./index";

describe("share tokens", () => {
  it("creates 32 random bytes as base64url and stores only the sha256", () => {
    const { token, tokenHash } = newShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toContain(token);
    expect(newShareToken().token).not.toBe(token);
  });
  it("verifies in constant time and rejects wrong, short, or malformed input", () => {
    const { token, tokenHash } = newShareToken();
    expect(verifyToken(token, tokenHash)).toBe(true);
    expect(verifyToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), tokenHash)).toBe(false);
    expect(verifyToken("", tokenHash)).toBe(false);
    expect(verifyToken(token, "zz")).toBe(false);
    expect(verifyToken(token, tokenHash.slice(0, 63))).toBe(false);
  });
});
