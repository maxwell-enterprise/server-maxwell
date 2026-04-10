-- Account deletion: user submits reason; Super Admin approves before User row is deleted.
CREATE TABLE IF NOT EXISTS "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_userId_status_idx"
  ON "AccountDeletionRequest" ("userId", "status");
CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_status_createdAt_idx"
  ON "AccountDeletionRequest" ("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AccountDeletionRequest_userId_fkey'
  ) THEN
    ALTER TABLE "AccountDeletionRequest"
      ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
