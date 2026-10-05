
import { createHash, randomBytes } from "node:crypto";
import { GrowthPinterestPublicationRole } from "@prisma/client";

import { PINTEREST_OAUTH_SCOPES, PINTEREST_OAUTH_STATE_TTL_MS, requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { PinterestTokenRequestError } from "@/lib/growth/errors";
import { pinterestTokenResponseSchema, type PinterestTokenResponse } from "@/lib/growth/pinterest/schemas";
import { prisma } from "@/lib/prisma";

export function hashPinterestOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export async function createPinterestOAuthState(adminUserId: string, publicationRole: GrowthPinterestPublicationRole) {
  const config = requirePinterestConfiguration();
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PINTEREST_OAUTH_STATE_TTL_MS);
  await prisma.growthPinterestOAuthState.create({ data: {
    stateHash: hashPinterestOAuthState(state), adminUserId, publicationRole,
    apiEnvironment: config.apiEnvironment, expiresAt,
  } });
  const authorizationUrl = new URL("https://www.pinterest.com/oauth/");
  authorizationUrl.searchParams.set("client_id", config.appId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", PINTEREST_OAUTH_SCOPES.join(","));
  authorizationUrl.searchParams.set("state", state);
  return { state, expiresAt, authorizationUrl: authorizationUrl.toString() };
}

export async function consumePinterestOAuthState(state: string, adminUserId: string) {
  const stateHash = hashPinterestOAuthState(state);
  return prisma.$transaction(async (tx) => {
    const record = await tx.growthPinterestOAuthState.findUnique({ where: { stateHash } });
    if (!record || record.adminUserId !== adminUserId || record.consumedAt || record.expiresAt <= new Date()) return null;
    const consumed = await tx.growthPinterestOAuthState.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    return consumed.count === 1 ? record : null;
  });
}

async function parseTokenResponse(response: Response): Promise<PinterestTokenResponse> {
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new PinterestTokenRequestError(response.status);
  const parsed = pinterestTokenResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Pinterest returned an invalid token response.");
  return parsed.data;
}

export async function exchangePinterestAuthorizationCode(code: string, fetchImpl: typeof fetch = fetch) {
  const config = requirePinterestConfiguration();
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri });
  const response = await fetchImpl(`${config.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  return parseTokenResponse(response);
}

export async function refreshPinterestToken(refreshToken: string, fetchImpl: typeof fetch = fetch) {
  const config = requirePinterestConfiguration();
  const response = await fetchImpl(`${config.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  });
  return parseTokenResponse(response);
}

export function tokenExpiries(token: PinterestTokenResponse, now = new Date()) {
  const accessTokenExpiresAt = new Date(now.getTime() + token.expires_in * 1000);
  const refreshTokenExpiresAt = token.refresh_token_expires_at
    ? new Date(token.refresh_token_expires_at * 1000)
    : token.refresh_token_expires_in
      ? new Date(now.getTime() + token.refresh_token_expires_in * 1000)
      : null;
  return { accessTokenExpiresAt, refreshTokenExpiresAt };
}
