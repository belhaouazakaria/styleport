import { getDiscordInteractionConfig } from "@/lib/growth/discord/config";
import {
  receiveDiscordDecision,
  verifyDiscordSignature,
} from "@/lib/growth/discord/interactions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let config;
  try {
    config = getDiscordInteractionConfig();
  } catch {
    return new Response(null, { status: 404 });
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    return new Response(null, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (
    !verifyDiscordSignature(
      raw,
      request.headers.get("x-signature-ed25519"),
      request.headers.get("x-signature-timestamp"),
      config.publicKey,
    )
  )
    return new Response(null, { status: 401 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (body.type === 1) return Response.json({ type: 1 });
  const accepted = await receiveDiscordDecision(body, config).catch(
    () => false,
  );
  return Response.json(
    accepted
      ? { type: 6 }
      : {
          type: 4,
          data: {
            content: "This decision is unavailable. Check SayTwist Admin.",
            flags: 64,
          },
        },
    { headers: { "cache-control": "no-store" } },
  );
}
