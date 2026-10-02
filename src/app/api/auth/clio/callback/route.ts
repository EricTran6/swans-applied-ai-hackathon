import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expected = req.cookies.get("clio_oauth_state")?.value;
  if (!state || !expected || state !== expected) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: url.searchParams.get("error") ?? "missing code" }, { status: 400 });
  }
  try {
    await exchangeCode(code);
  } catch {
    return NextResponse.json({ error: "token exchange failed" }, { status: 502 });
  }
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete("clio_oauth_state");
  return res;
}
