BEGIN;
ALTER TABLE "GrowthDiscordInteraction" ADD COLUMN "selectionValue" VARCHAR(100);
ALTER TABLE "GrowthDiscordInteraction" DROP CONSTRAINT "interaction_action";
ALTER TABLE "GrowthDiscordInteraction" ADD CONSTRAINT "interaction_action" CHECK (
 ("action" IN ('APPROVE','REJECT') AND "selectionValue" IS NULL) OR
 ("action" IN ('PLAN_ACCOUNT','PLAN_BOARD','PLAN_SITE') AND "selectionValue" IS NOT NULL AND length("selectionValue") > 0)
);
ALTER TABLE "GrowthNotification" ADD COLUMN "reviewCardVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GrowthViralPinTest" ADD COLUMN "designGenerationKind" VARCHAR(24);
COMMIT;
