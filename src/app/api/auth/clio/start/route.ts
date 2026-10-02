import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clioAuthorizeUrl, oauthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!oauthConfigured()) {
    return NextResponse.json({ error: "CLIO_CLIENT_ID / CLIO_CLIENT_SECRET not configured" }, { status: 500 });
  }
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(clioAuthorizeUrl(state));
  res.cookies.set("clio_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production" && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(process.env.CLIO_REDIRECT_URI ?? ""),
  });
  return res;
}
