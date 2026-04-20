import crypto from "node:crypto";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function safeTrim(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeCandidateIp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  const clean = candidate.replace(/^\[|\]$/g, "");
  let plain = clean;

  if (clean.includes(".") && clean.includes(":")) {
    const parts = clean.split(":");
    const maybePort = parts.at(-1) || "";
    const maybeIpv4 = parts.slice(0, -1).join(":");
    const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;

    if (/^\d{1,5}$/.test(maybePort) && ipv4Regex.test(maybeIpv4)) {
      plain = maybeIpv4;
    }
  }

  const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^[a-f0-9:]+$/i;

  if (ipv4Regex.test(plain) || ipv6Regex.test(plain)) {
    return plain.toLowerCase();
  }

  return null;
}

export function extractClientIp(request: Request): string {
  const trustProxyHeaders = parseBooleanEnv(process.env.TRUST_PROXY_HEADERS, true);
  const trustedHeaderOrder = [
    "cf-connecting-ip",
    "x-vercel-forwarded-for",
    "x-forwarded-for",
    "x-real-ip",
    "fly-client-ip",
  ];
  const safeFallbackHeaders = ["x-real-ip", "fly-client-ip"];

  const headersToCheck = trustProxyHeaders ? trustedHeaderOrder : safeFallbackHeaders;

  for (const headerName of headersToCheck) {
    const raw = request.headers.get(headerName);
    if (!raw) continue;

    if (headerName === "x-forwarded-for") {
      const forwarded = raw
        .split(",")
        .map((item) => normalizeCandidateIp(item))
        .find(Boolean);
      if (forwarded) {
        return forwarded;
      }
      continue;
    }

    const ip = normalizeCandidateIp(raw);
    if (ip) {
      return ip;
    }
  }

  return "unknown";
}

export function toPlainText(text: string): string {
  return text
    .replace(/^```[\s\S]*?\n/gm, "")
    .replace(/```$/gm, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function hashIp(ip: string): string {
  const ipSalt = process.env.IP_HASH_SECRET || process.env.NEXTAUTH_SECRET || "styleport-dev-ip-salt";
  return crypto.createHash("sha256").update(`${ipSalt}:${ip}`).digest("hex").slice(0, 40);
}

export function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
