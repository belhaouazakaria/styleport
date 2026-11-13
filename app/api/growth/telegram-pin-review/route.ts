import { NextResponse } from "next/server";
import {
  acceptPrivatePinCallback, getPrivatePinReviewConfig, secretMatches,
} from "@/lib/growth/publishing/telegram-pin-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = getPrivatePinReviewConfig();
  } catch {
    return new Response(null, { status: 404 });
  }
  const supplied = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secretMatches(supplied, config.webhookSecret)) {
    return new Response(null, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    return new Response(null, { status: 415 });
  }
  if (Number(request.headers.get("content-length") || 0) > 8192) {
    return new Response(null, { status: 413 });
  }
  const raw = await request.text().catch(() => "");
  if (raw.length > 8192 || raw.length < 2) return new Response(null, { status: 400 });
  const update: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!update) return new Response(null, { status: 400 });
  // Invalid, stale, or replayed callbacks are accepted by the HTTP transport
  // but are never authorized to change the database or publish a Pin.
  const result = await acceptPrivatePinCallback(update, config).catch(() => ({ status: "FAILED" }));
  return NextResponse.json({ ok: true, status: result.status }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function GET() {
  return new Response(null, { status: 405 });
}
