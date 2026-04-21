import { NextResponse } from "next/server";

import { ensureTranslatorShareImageBySlug, getShareImageAbsoluteUrl } from "@/lib/share-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { slug } = await params;
  const ensured = await ensureTranslatorShareImageBySlug(slug);

  if (!ensured?.shareImagePath) {
    return new NextResponse("Translator not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const target = getShareImageAbsoluteUrl(ensured.shareImagePath);
  if (!target) {
    return new NextResponse("Share image unavailable", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.redirect(target, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
