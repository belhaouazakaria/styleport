import { createSign } from "node:crypto";
import { z } from "zod";
import { parseUtcDateOnly } from "@/lib/growth/pinterest/analytics-contract";
export type GoogleSource = "GA4" | "SEARCH_CONSOLE";
export type GoogleDailyRow = { date: string; metrics: Record<string, string> };
export class GoogleAnalyticsError extends Error {
  constructor(
    readonly code:
      | "CONFIGURATION"
      | "AUTHORIZATION"
      | "RATE_LIMIT"
      | "TRANSIENT"
      | "INVALID_DATA",
    readonly retryAfterMs = 60000,
  ) {
    super("GOOGLE_ANALYTICS_" + code);
  }
}
const credentialSchema = z.object({
  type: z.literal("service_account"),
  client_email: z.email().max(254),
  private_key: z.string().min(100).max(10000),
  token_uri: z.literal("https://oauth2.googleapis.com/token"),
});
export function googleAnalyticsConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.GROWTH_GOOGLE_ANALYTICS_ENABLED !== "true")
    throw new GoogleAnalyticsError("CONFIGURATION");
  let credential;
  try {
    credential = credentialSchema.parse(
      JSON.parse(env.GROWTH_GOOGLE_SERVICE_ACCOUNT_JSON || ""),
    );
  } catch {
    throw new GoogleAnalyticsError("CONFIGURATION");
  }
  const propertyId = env.GROWTH_GA4_PROPERTY_ID;
  const site = env.GROWTH_SEARCH_CONSOLE_SITE;
  if (propertyId && !/^[1-9][0-9]{0,14}$/.test(propertyId))
    throw new GoogleAnalyticsError("CONFIGURATION");
  if (
    site &&
    ![
      "sc-domain:saytwist.com",
      "https://saytwist.com/",
      "https://www.saytwist.com/",
    ].includes(site)
  )
    throw new GoogleAnalyticsError("CONFIGURATION");
  if (!propertyId && !site) throw new GoogleAnalyticsError("CONFIGURATION");
  return { credential, propertyId, site };
}
export type GoogleAnalyticsConfig = ReturnType<typeof googleAnalyticsConfig>;
async function requestJson(
  url: string,
  body: unknown,
  token: string | null,
  fetcher: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "content-type":
          typeof body === "string"
            ? "application/x-www-form-urlencoded"
            : "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new GoogleAnalyticsError("TRANSIENT");
  }
  if (!response.ok) {
    const delay = Number(response.headers.get("retry-after"));
    throw new GoogleAnalyticsError(
      response.status === 401 || response.status === 403
        ? "AUTHORIZATION"
        : response.status === 429
          ? "RATE_LIMIT"
          : "TRANSIENT",
      Number.isFinite(delay) && delay > 0
        ? Math.min(86400000, delay * 1000)
        : 60000,
    );
  }
  const raw = await response.text();
  if (raw.length > 1000000) throw new GoogleAnalyticsError("INVALID_DATA");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new GoogleAnalyticsError("INVALID_DATA");
  }
}
export async function obtainGoogleAnalyticsToken(
  config: GoogleAnalyticsConfig,
  source: GoogleSource,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const encode = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const issued = Math.floor(now.getTime() / 1000);
  const assertion =
    encode({ alg: "RS256", typ: "JWT" }) +
    "." +
    encode({
      iss: config.credential.client_email,
      scope:
        source === "GA4"
          ? "https://www.googleapis.com/auth/analytics.readonly"
          : "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: issued,
      exp: issued + 3600,
    });
  let signature: string;
  try {
    signature = createSign("RSA-SHA256")
      .update(assertion)
      .sign(config.credential.private_key)
      .toString("base64url");
  } catch {
    throw new GoogleAnalyticsError("CONFIGURATION");
  }
  const response = await requestJson(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion + "." + signature,
    }).toString(),
    null,
    fetcher,
  );
  const parsed = z
    .object({
      access_token: z.string().min(1).max(4096),
      token_type: z.literal("Bearer"),
      expires_in: z.number().int().min(60).max(3600),
    })
    .safeParse(response);
  if (!parsed.success) throw new GoogleAnalyticsError("INVALID_DATA");
  return parsed.data.access_token;
}
const numeric = z.string().regex(/^\d{1,16}(?:\.\d{1,8})?$/);
export async function readGoogleDailyAnalytics(
  source: GoogleSource,
  accountId: string,
  startDate: string,
  endDate: string,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  const start = parseUtcDateOnly(startDate),
    end = parseUtcDateOnly(endDate);
  if (end < start || end.getTime() - start.getTime() > 89 * 86400000)
    throw new GoogleAnalyticsError("INVALID_DATA");
  const rows: GoogleDailyRow[] = [];
  let providerTimeZone = "America/Los_Angeles";
  if (source === "GA4") {
    if (!/^[1-9][0-9]{0,14}$/.test(accountId))
      throw new GoogleAnalyticsError("CONFIGURATION");
    const names = ["sessions", "activeUsers", "keyEvents"];
    const response = await requestJson(
      "https://analyticsdata.googleapis.com/v1beta/properties/" +
        accountId +
        ":runReport",
      {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: names.map((name) => ({ name })),
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: "100",
        offset: "0",
        returnPropertyQuota: true,
      },
      token,
      fetcher,
    );
    const parsed = z
      .object({
        dimensionHeaders: z.array(z.object({ name: z.string() })).length(1),
        metricHeaders: z
          .array(z.object({ name: z.string(), type: z.string() }))
          .length(3),
        rows: z
          .array(
            z.object({
              dimensionValues: z
                .array(z.object({ value: z.string() }))
                .length(1),
              metricValues: z.array(z.object({ value: numeric })).length(3),
            }),
          )
          .max(90)
          .optional(),
        rowCount: z.number().int().min(0).max(90).optional(),
        metadata: z.object({
          timeZone: z.string().min(1).max(80),
          subjectToThresholding: z.boolean().optional(),
          dataLossFromOtherRow: z.boolean().optional(),
        }),
      })
      .safeParse(response);
    if (
      !parsed.success ||
      parsed.data.dimensionHeaders[0].name !== "date" ||
      parsed.data.metricHeaders.some((h, i) => h.name !== names[i]) ||
      parsed.data.metadata.subjectToThresholding ||
      parsed.data.metadata.dataLossFromOtherRow ||
      (parsed.data.rowCount ?? 0) !== (parsed.data.rows?.length ?? 0)
    )
      throw new GoogleAnalyticsError("INVALID_DATA");
    providerTimeZone = parsed.data.metadata.timeZone;
    for (const row of parsed.data.rows ?? []) {
      const raw = row.dimensionValues[0].value;
      if (!/^\d{8}$/.test(raw)) throw new GoogleAnalyticsError("INVALID_DATA");
      rows.push({
        date: raw.slice(0, 4) + "-" + raw.slice(4, 6) + "-" + raw.slice(6),
        metrics: Object.fromEntries(
          names.map((n, i) => [n, row.metricValues[i].value]),
        ),
      });
    }
  } else {
    if (
      ![
        "sc-domain:saytwist.com",
        "https://saytwist.com/",
        "https://www.saytwist.com/",
      ].includes(accountId)
    )
      throw new GoogleAnalyticsError("CONFIGURATION");
    const response = await requestJson(
      "https://www.googleapis.com/webmasters/v3/sites/" +
        encodeURIComponent(accountId) +
        "/searchAnalytics/query",
      {
        startDate,
        endDate,
        dimensions: ["date"],
        type: "web",
        dataState: "final",
        rowLimit: 100,
        startRow: 0,
      },
      token,
      fetcher,
    );
    const parsed = z
      .object({
        rows: z
          .array(
            z.object({
              keys: z.array(z.string()).length(1),
              clicks: z.number().int().nonnegative().safe(),
              impressions: z.number().int().nonnegative().safe(),
              ctr: z.number().min(0).max(1),
              position: z.number().finite().nonnegative(),
            }),
          )
          .max(90)
          .optional(),
      })
      .safeParse(response);
    if (!parsed.success) throw new GoogleAnalyticsError("INVALID_DATA");
    for (const row of parsed.data.rows ?? [])
      rows.push({
        date: row.keys[0],
        metrics: {
          clicks: String(row.clicks),
          impressions: String(row.impressions),
          ctr: String(row.ctr),
          position: String(row.position),
        },
      });
  }
  const seen = new Set<string>();
  for (const row of rows) {
    let date: Date;
    try {
      date = parseUtcDateOnly(row.date);
    } catch {
      throw new GoogleAnalyticsError("INVALID_DATA");
    }
    if (date < start || date > end || seen.has(row.date))
      throw new GoogleAnalyticsError("INVALID_DATA");
    seen.add(row.date);
  }
  return {
    rows,
    providerTimeZone,
    qualityFlags: [
      source === "GA4"
        ? "PROPERTY_TIME_ZONE_DATES"
        : "PACIFIC_TIME_FINALIZED_DATES",
      "OMITTED_DATES_ARE_UNAVAILABLE",
      "KEY_EVENTS_ARE_NOT_ASSUMED_QUALIFIED_TRANSLATIONS",
    ],
  };
}
