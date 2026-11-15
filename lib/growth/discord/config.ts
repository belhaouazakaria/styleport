export const discordSnowflake = /^[1-9][0-9]{16,23}$/;
export function getDiscordConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.GROWTH_DISCORD_ENABLED !== "true") throw Error("DISCORD_DISABLED");
  const applicationId = env.DISCORD_APPLICATION_ID || "";
  const ownerDiscordId = env.DISCORD_OWNER_USER_ID || "";
  const ownerUserId = env.GROWTH_DISCORD_OWNER_USER_ID || "";
  const publicKey = env.DISCORD_PUBLIC_KEY || "";
  const token = env.DISCORD_BOT_TOKEN || "";
  if (
    !discordSnowflake.test(applicationId) ||
    !discordSnowflake.test(ownerDiscordId) ||
    !/^[a-zA-Z0-9_-]{1,191}$/.test(ownerUserId) ||
    !/^[a-fA-F0-9]{64}$/.test(publicKey) ||
    !/^[A-Za-z0-9_.-]{30,256}$/.test(token)
  )
    throw Error("DISCORD_CONFIGURATION_INVALID");
  return { applicationId, ownerDiscordId, ownerUserId, publicKey, token };
}
export type DiscordConfig = ReturnType<typeof getDiscordConfig>;
