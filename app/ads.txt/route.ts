import { isLegacyTranslatorHostname } from "@/lib/legacy-domain";

export const dynamic = "force-dynamic";

/**
 * A separate seller authorization for the legacy domain, configured only
 * after the owner verifies the exact AdSense account and site approval.
 * SayTwist's Ezoic ads.txt redirect remains scoped to the SayTwist host.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isLegacyTranslatorHostname(request.headers.get("host"))) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const content = (process.env.LEGACY_TRANSLATOR_ADS_TXT || "").trim();
  if (!content) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(content + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
