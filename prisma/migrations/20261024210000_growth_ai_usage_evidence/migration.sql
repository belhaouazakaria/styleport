-- Add immutable, per-reservation provider-response evidence without rewriting
-- or "reconciling" any existing pessimistic reservations.
CREATE TYPE "GrowthAiUsageOutcome" AS ENUM ('RESPONSE_RECEIVED', 'OUTCOME_UNKNOWN');

CREATE TABLE "GrowthAiUsageEvent" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "outcome" "GrowthAiUsageOutcome" NOT NULL,
  "providerResponseId" VARCHAR(191),
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "totalTokens" INTEGER,
  "imageUnits" INTEGER,
  "estimatedMicroUsd" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthAiUsageEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthAiUsageEvent_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "GrowthAiBudgetReservation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrowthAiUsageEvent_token_nonnegative_check"
    CHECK (
      ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
      ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
      ("totalTokens" IS NULL OR "totalTokens" >= 0) AND
      ("imageUnits" IS NULL OR "imageUnits" >= 1) AND
      ("estimatedMicroUsd" IS NULL OR "estimatedMicroUsd" >= 0)
    ),
  CONSTRAINT "GrowthAiUsageEvent_unknown_has_no_usage_check"
    CHECK ("outcome" = 'RESPONSE_RECEIVED' OR
      ("providerResponseId" IS NULL AND "inputTokens" IS NULL
       AND "outputTokens" IS NULL AND "totalTokens" IS NULL
       AND "imageUnits" IS NULL AND "estimatedMicroUsd" IS NULL))
);
CREATE UNIQUE INDEX "GrowthAiUsageEvent_reservationId_key"
  ON "GrowthAiUsageEvent"("reservationId");
CREATE INDEX "GrowthAiUsageEvent_createdAt_outcome_idx"
  ON "GrowthAiUsageEvent"("createdAt", "outcome");

-- Evidence rows are append-only even if an application caller makes a mistake.
CREATE FUNCTION "guardGrowthAiUsageAppendOnly"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GrowthAiUsageEvent evidence is immutable';
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER "GrowthAiUsageEvent_append_only"
  BEFORE UPDATE OR DELETE ON "GrowthAiUsageEvent"
  FOR EACH ROW EXECUTE FUNCTION "guardGrowthAiUsageAppendOnly"();
