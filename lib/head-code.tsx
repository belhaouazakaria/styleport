import type { ReactNode } from "react";
import Script from "next/script";

type HtmlAttributeValue = string | boolean;

const TAG_PATTERN = /<script\b[\s\S]*?<\/script>|<meta\b[^>]*\/?>|<link\b[^>]*\/?>/gi;
const SCRIPT_PATTERN = /^<script\b([^>]*)>([\s\S]*?)<\/script>$/i;
const META_PATTERN = /^<meta\b([^>]*)\/?>$/i;
const LINK_PATTERN = /^<link\b([^>]*)\/?>$/i;
const ATTRIBUTE_PATTERN = /([:@A-Za-z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function normalizeAttributeName(name: string) {
  const lowered = name.toLowerCase();

  switch (lowered) {
    case "charset":
      return "charSet";
    case "http-equiv":
      return "httpEquiv";
    case "crossorigin":
      return "crossOrigin";
    case "referrerpolicy":
      return "referrerPolicy";
    case "fetchpriority":
      return "fetchPriority";
    default:
      return lowered;
  }
}

function parseAttributes(raw: string): Record<string, HtmlAttributeValue> {
  const attributes: Record<string, HtmlAttributeValue> = {};
  const attributePattern = new RegExp(ATTRIBUTE_PATTERN);
  let match: RegExpExecArray | null = attributePattern.exec(raw);

  while (match) {
    const rawName = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    const normalizedName = normalizeAttributeName(rawName);

    if (!normalizedName.startsWith("on")) {
      attributes[normalizedName] = typeof value === "string" ? value : true;
    }

    match = attributePattern.exec(raw);
  }

  return attributes;
}

function toReactProps(attributes: Record<string, HtmlAttributeValue>) {
  const props: Record<string, HtmlAttributeValue> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("data-") || key.startsWith("aria-")) {
      props[key] = value;
      continue;
    }

    props[key] = value;
  }

  return props;
}

function renderScriptTag(tag: string, key: string) {
  const scriptMatch = SCRIPT_PATTERN.exec(tag);
  if (!scriptMatch) {
    return null;
  }

  const attributes = parseAttributes(scriptMatch[1] || "");
  const props = toReactProps(attributes);
  const src = typeof props.src === "string" ? props.src : "";
  const content = (scriptMatch[2] || "").trim();
  const rest = { ...props };
  delete rest.src;

  if (src) {
    return <Script key={key} src={src} strategy="afterInteractive" {...rest} />;
  }

  if (!content) {
    return null;
  }

  return (
    <Script
      key={key}
      id={`${key}-inline`}
      strategy="afterInteractive"
      {...rest}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

function renderMetaTag(tag: string, key: string) {
  const metaMatch = META_PATTERN.exec(tag);
  if (!metaMatch) {
    return null;
  }

  const attributes = parseAttributes(metaMatch[1] || "");
  const props = toReactProps(attributes);
  return <meta key={key} {...props} />;
}

function renderLinkTag(tag: string, key: string) {
  const linkMatch = LINK_PATTERN.exec(tag);
  if (!linkMatch) {
    return null;
  }

  const attributes = parseAttributes(linkMatch[1] || "");
  const props = toReactProps(attributes);
  return <link key={key} {...props} />;
}

export function renderCustomHeadCode(code: string): ReactNode[] {
  const html = code.trim();
  if (!html) {
    return [];
  }

  const nodes: ReactNode[] = [];
  let index = 0;
  const tagPattern = new RegExp(TAG_PATTERN);
  let match: RegExpExecArray | null = tagPattern.exec(html);

  while (match) {
    const tag = match[0];
    const key = `custom-head-${index}`;
    const lowerTag = tag.toLowerCase();
    let node: ReactNode | null = null;

    if (lowerTag.startsWith("<script")) {
      node = renderScriptTag(tag, key);
    } else if (lowerTag.startsWith("<meta")) {
      node = renderMetaTag(tag, key);
    } else if (lowerTag.startsWith("<link")) {
      node = renderLinkTag(tag, key);
    }

    if (node) {
      nodes.push(node);
      index += 1;
    }

    match = tagPattern.exec(html);
  }

  if (!nodes.length) {
    nodes.push(
      <Script
        key="custom-head-inline-fallback"
        id="custom-head-inline-fallback"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: html,
        }}
      />,
    );
  }

  return nodes;
}
