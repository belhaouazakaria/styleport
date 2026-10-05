import { NextResponse } from "next/server";

import { fetchPinterestUserAccountWithToken } from "@/lib/growth/pinterest/api";
import { connectPinterestAccount, isUniqueConstraintError } from "@/lib/growth/pinterest/accounts";
import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { enqueuePinterestSyncJobs } from "@/lib/growth/pinterest/jobs";
import { consumePinterestOAuthState, exchangePinterestAuthorizationCode } from "@/lib/growth/pinterest/oauth";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

function adminRedirect(status: string) {
  const configured = requirePinterestConfiguration();
  const url = new URL("/admin/growth/accounts", configured.redirectUri);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url, 302);
}

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const session = await getSessionOrNull();
  if (!session?.user?.id) return adminRedirect("unauthorized");
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  if (!state) return adminRedirect("invalid_state");
  const oauthState = await consumePinterestOAuthState(state, session.user.id);
  if (!oauthState) return adminRedirect("invalid_state");
  if (params.get("error")) return adminRedirect("denied");
  const code = params.get("code");
  if (!code) return adminRedirect("missing_code");
  try {
    const token = await exchangePinterestAuthorizationCode(code);
    const profile = await fetchPinterestUserAccountWithToken(token.access_token);
    const account = await connectPinterestAccount({
      profile: profile.data, token, publicationRole: oauthState.publicationRole, adminUserId: session.user.id,
    });
    await enqueuePinterestSyncJobs(account.id);
    return adminRedirect("connected");
  } catch (error) {
    return adminRedirect(isUniqueConstraintError(error) ? "role_or_account_conflict" : "connection_failed");
  }
}
