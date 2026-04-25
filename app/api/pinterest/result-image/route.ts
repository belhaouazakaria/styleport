import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

const body = {
  ok: false,
  error: {
    code: "RESULT_PIN_CLIENT_ONLY",
    message: "Result Pinterest images are generated client-side.",
  },
} as const;

const headers = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
} as const;

export function GET() {
  return NextResponse.json(body, {
    status: 410,
    headers,
  });
}

export function HEAD() {
  return new Response(null, {
    status: 410,
    headers,
  });
}
