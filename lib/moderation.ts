import { CommentModerationStatus } from "@prisma/client";

interface ModerationOutcome<TVerdict extends string> {
  verdict: TVerdict;
  reason: string | null;
}

interface RequestModerationInput {
  requestedName: string;
  description: string;
  desiredStyle?: string | null;
  audience?: string | null;
  notes?: string | null;
}

interface CommentModerationInput {
  name: string;
  email: string;
  comment: string;
}

const URL_PATTERN = /\b((https?:\/\/|www\.)[^\s]+)/gi;
const SPAM_PATTERN =
  /\b(casino|betting|loan|forex|crypto|viagra|porn|adult|seo service|backlink|buy followers|telegram channel|whatsapp group)\b/i;
const SUSPICIOUS_COMMENT_PATTERN =
  /\b(casino|betting|loan|forex|crypto|viagra|porn|adult|seo service|backlink|buy followers)\b/i;
const HTML_TAG_PATTERN = /<[^>]+>/;
const EXTREME_REPEAT_PATTERN = /(.)\1{7,}/i;

function countMatches(value: string, pattern: RegExp) {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
}

function countWords(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countLetters(value: string) {
  const matches = value.match(/[a-z]/gi);
  return matches ? matches.length : 0;
}

function uppercaseRatio(value: string) {
  const letters = value.match(/[a-z]/gi) || [];
  if (!letters.length) {
    return 0;
  }

  const uppercase = value.match(/[A-Z]/g) || [];
  return uppercase.length / letters.length;
}

function uniqueCharacterRatio(value: string) {
  if (!value.length) {
    return 0;
  }

  return new Set(value.toLowerCase()).size / value.length;
}

function noiseRatio(value: string) {
  if (!value.length) {
    return 0;
  }

  const noiseChars = value.match(/[^a-z0-9\s.,!?'"-]/gi) || [];
  return noiseChars.length / value.length;
}

export function assessTranslatorRequestForAutoApproval(
  input: RequestModerationInput,
): ModerationOutcome<"good" | "manual_review"> {
  const combined = [
    input.requestedName || "",
    input.description || "",
    input.desiredStyle || "",
    input.audience || "",
    input.notes || "",
  ]
    .join(" ")
    .trim();

  const normalizedDescription = (input.description || "").trim();
  const urlCount = countMatches(combined, URL_PATTERN);
  if (urlCount >= 2) {
    return { verdict: "manual_review", reason: "Contains multiple external links." };
  }

  if (SPAM_PATTERN.test(combined)) {
    return { verdict: "manual_review", reason: "Contains suspicious spam-like keywords." };
  }

  if (EXTREME_REPEAT_PATTERN.test(combined)) {
    return { verdict: "manual_review", reason: "Contains excessive repeated characters." };
  }

  if (countWords(normalizedDescription) < 4 || countLetters(normalizedDescription) < 24) {
    return { verdict: "manual_review", reason: "Description quality is too low for auto-approval." };
  }

  if (combined.length >= 120 && uniqueCharacterRatio(combined) < 0.1) {
    return { verdict: "manual_review", reason: "Content looks repetitive or low-signal." };
  }

  if (combined.length >= 50 && uppercaseRatio(combined) > 0.75) {
    return { verdict: "manual_review", reason: "Content uses excessive uppercase styling." };
  }

  if (combined.length >= 50 && noiseRatio(combined) > 0.24) {
    return { verdict: "manual_review", reason: "Content contains too many noisy symbols." };
  }

  return { verdict: "good", reason: null };
}

export function assessTranslatorCommentModeration(input: CommentModerationInput): {
  status: CommentModerationStatus;
  reason: string | null;
} {
  const combined = `${input.name} ${input.email} ${input.comment}`.trim();

  if (HTML_TAG_PATTERN.test(input.comment)) {
    return {
      status: CommentModerationStatus.PENDING_REVIEW,
      reason: "Contains HTML-like markup and requires manual review.",
    };
  }

  if (countMatches(combined, URL_PATTERN) > 0) {
    return {
      status: CommentModerationStatus.PENDING_REVIEW,
      reason: "Contains external link and requires manual review.",
    };
  }

  if (SUSPICIOUS_COMMENT_PATTERN.test(combined)) {
    return {
      status: CommentModerationStatus.PENDING_REVIEW,
      reason: "Contains suspicious spam-like keywords.",
    };
  }

  if (EXTREME_REPEAT_PATTERN.test(combined)) {
    return {
      status: CommentModerationStatus.PENDING_REVIEW,
      reason: "Contains excessive repeated characters.",
    };
  }

  if (input.comment.length >= 40 && uppercaseRatio(input.comment) > 0.8) {
    return {
      status: CommentModerationStatus.PENDING_REVIEW,
      reason: "Contains excessive uppercase styling.",
    };
  }

  if (input.comment.length >= 40 && noiseRatio(input.comment) > 0.26) {
    return {
      status: CommentModerationStatus.PENDING_REVIEW,
      reason: "Contains too many noisy symbols.",
    };
  }

  return {
    status: CommentModerationStatus.VISIBLE,
    reason: null,
  };
}
