-- Alter defaults only; preserve historical delivery rows and their channel values.
ALTER TABLE "GrowthReportDelivery" ALTER COLUMN "channel" SET DEFAULT 'TELEGRAM';
