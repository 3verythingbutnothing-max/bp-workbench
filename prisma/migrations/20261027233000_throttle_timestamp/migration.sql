-- Raw authentication SQL binds absolute instants. Preserve that meaning even
-- when PostgreSQL's session timezone differs from UTC.
ALTER TABLE "LoginThrottle"
  ALTER COLUMN "resetAt" TYPE TIMESTAMPTZ(3)
  USING "resetAt" AT TIME ZONE 'UTC';
