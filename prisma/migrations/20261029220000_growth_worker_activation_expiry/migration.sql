-- Additive, default OFF. Existing Growth settings cannot authorize any worker until
-- an owner-gated activation sets a finite deadline independently of enabled.
ALTER TABLE "GrowthSettings" ADD COLUMN "workerActivationExpiresAt" TIMESTAMP(3);
