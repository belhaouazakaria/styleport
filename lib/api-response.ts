import { NextResponse } from "next/server";

import type { ApiErrorCode } from "@/lib/types";

const noStoreHeaders = {
  "Cache-Control": "no-store",
} as const;

export function apiError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status, headers: noStoreHeaders },
  );
}

export function apiOk<T extends Record<string, unknown>>(payload: T, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status, headers: noStoreHeaders });
}
