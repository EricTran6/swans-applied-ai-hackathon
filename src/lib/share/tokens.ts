// Share-link tokens: 32 random bytes (base64url) shown once; only the sha256 is stored.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyToken(token: string, storedHash: string): boolean {
  if (typeof token !== "string" || typeof storedHash !== "string" || token.length < 16 || token.length > 128) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && a.length === 32 && timingSafeEqual(a, b);
}
