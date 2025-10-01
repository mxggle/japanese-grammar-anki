-- Update card_progress schema for Anki-style scheduling
ALTER TABLE "card_progress"
  ALTER COLUMN "interval" TYPE double precision;

ALTER TABLE "card_progress"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS "stepIndex" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lapses" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "previousInterval" double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isLeech" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lastSyncedDeviceId" text,
  ADD COLUMN IF NOT EXISTS "sessionId" text,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Ensure updatedAt reflects the latest change
CREATE OR REPLACE FUNCTION update_card_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_card_progress_updated_at ON "card_progress";
CREATE TRIGGER set_card_progress_updated_at
BEFORE UPDATE ON "card_progress"
FOR EACH ROW
EXECUTE FUNCTION update_card_progress_updated_at();

-- Extend daily stats for new metrics
ALTER TABLE "daily_stats"
  ADD COLUMN IF NOT EXISTS "newCardsLearned" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewsCompleted" integer NOT NULL DEFAULT 0;
