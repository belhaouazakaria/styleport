# Legacy translator hostname routing

Updated 2026-11-11.

## Decision

Serve the existing SayTwist application at `https://translator.whattypeof.com` without a Next.js host-specific 308 redirect. Keep `https://saytwist.com` unchanged as the canonical SEO domain. The unrelated plural alias `translators.whattypeof.com` remains configured as a redirect but may not have DNS.

This change removes only the singular hostname's redirects from `next.config.ts`. It does not create a separate product, change database ownership, add a DNS record, or alter application base URLs, canonical metadata, sitemaps, the advertising configuration or authentication policy.

## Release and validation

1. Merge only after lint, typecheck, Vitest and production build pass. Release through the existing reviewed exact-SHA production deployment process, without direct file edits on the VPS or migration bypass.
2. Verify DNS/IPv4/IPv6 and TLS for the singular hostname before deployment and after rollout. The previous public test resolved two A addresses and reached an IPv6 listener, with HTTP 301 to HTTPS followed by an application 308 to `saytwist.com`.
3. After deployment, test `https://translator.whattypeof.com/` and `/translators/jester-translator` without following redirects: expect application HTTP 200 on the original host, not HTTP 308 to `saytwist.com`.
4. Exercise an actual translation flow (including browser/API requests), images, authentication entry points, and CSP/security cookies from the old hostname. Check core `saytwist.com` health/ready and translation flow again.
5. Confirm page canonical, sitemap and SEO scope intentionally remain on `saytwist.com`. Pages served from the old hostname are a non-canonical mirror; this does **not** request Google to index both hostnames. If primary-domain migration is desired later, plan it separately.
6. Monitor and roll back through the protected release runbook if old-host traffic, cookies or primary-site availability regress.

No production DNS/Nginx, database, Growth feature flags, or external provider state is changed by this code PR.
