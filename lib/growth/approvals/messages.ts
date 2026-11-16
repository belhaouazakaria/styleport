const messages: Record<string, string> = {
  SOURCE_APPROVAL_QUALITY_DEFERRED: "This source Pin needs a later date. Choose Find a new time, then review the updated plan.",
  SOURCE_APPROVAL_CHANNEL_QUOTA: "This day's source Pin slots are full. Choose Find a new time.",
  VIRAL_CHANNEL_QUOTA_EXHAUSTED: "This day's publishing slots are full. Choose Find a new time.",
  REVIEW_SCHEDULE_COLLISION: "Another Pin already uses this publishing window. Choose Find a new time.",
  ROTATION_ACCOUNT_NOT_SCHEDULED_TODAY: "This account is not scheduled for that day. Choose Find a new time.",
  SOURCE_APPROVAL_GLOBAL_OFF_REQUIRED: "A background task is running. Wait a moment and try again.",
  SOURCE_APPROVAL_ACCOUNT_UNAVAILABLE: "Reconnect the Pinterest account and check that its board is active.",
  REVIEW_EVIDENCE_MISMATCH: "This review has changed. Refresh to see its current plan.",
  REVIEW_NOT_PENDING: "This review is already closed. Refresh to see its current status.",
  REVIEW_NO_SAFE_SLOT: "No eligible publishing slot is available in the next 30 days. Check account readiness and daily targets.",
  SOURCE_APPROVAL_QUALITY_WITHDRAWN: "This source concept no longer meets the quality requirements.",
};
export function growthReviewErrorMessage(error: unknown) {
  return error instanceof Error && messages[error.message] ||
    "This Pin is no longer eligible. Refresh the review and check its account and board.";
}
