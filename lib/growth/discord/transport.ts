import { type DiscordConfig, discordSnowflake } from "./config";

export class DiscordTransportError extends Error {
  constructor(
    readonly code: "RATE_LIMIT" | "REJECTED" | "UNKNOWN",
    readonly retryAfterMs = 60_000,
  ) {
    super("DISCORD_" + code);
  }
}
export async function discordRequest(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  config: DiscordConfig,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher("https://discord.com/api/v10" + path, {
      method,
      headers: {
        authorization: "Bot " + config.token,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new DiscordTransportError("UNKNOWN");
  }
  if (response.status === 429) {
    const rate = await response.json().catch(() => null);
    const seconds =
      typeof rate?.retry_after === "number" && Number.isFinite(rate.retry_after)
        ? rate.retry_after
        : 60;
    throw new DiscordTransportError(
      "RATE_LIMIT",
      Math.max(1000, Math.min(86400_000, Math.ceil(seconds * 1000))),
    );
  }
  if (!response.ok)
    throw new DiscordTransportError(
      response.status < 500 ? "REJECTED" : "UNKNOWN",
    );
  const data: unknown = await response.json().catch(() => null);
  if (
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    typeof data.id !== "string" ||
    !discordSnowflake.test(data.id)
  )
    throw new DiscordTransportError("UNKNOWN");
  return data as {
    id: string;
    channel_id?: string;
    type?: number;
    recipients?: { id: string }[];
  };
}
