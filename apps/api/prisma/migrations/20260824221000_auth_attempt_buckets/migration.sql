-- Persistent, aggregate-only authentication throttling. It deliberately stores
-- no password, session token, or individual request history.
CREATE TABLE "auth_attempt_buckets" (
    "key" TEXT NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "locked_until" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempt_buckets_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "auth_attempt_buckets_failure_count_check" CHECK ("failure_count" >= 0)
);
