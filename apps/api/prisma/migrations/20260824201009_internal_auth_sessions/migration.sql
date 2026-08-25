-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('INTERNAL', 'PORTAL');

-- CreateTable
CREATE TABLE "internal_credentials" (
    "internal_user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "credentials_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_credentials_pkey" PRIMARY KEY ("internal_user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "internal_user_id" UUID,
    "secret_hash" TEXT NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_secret_hash_key" ON "sessions"("secret_hash");

-- CreateIndex
CREATE INDEX "sessions_internal_user_id_idx" ON "sessions"("internal_user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_revoked_at_idx" ON "sessions"("revoked_at");

-- AddForeignKey
ALTER TABLE "internal_credentials" ADD CONSTRAINT "internal_credentials_internal_user_id_fkey" FOREIGN KEY ("internal_user_id") REFERENCES "internal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_internal_user_id_fkey" FOREIGN KEY ("internal_user_id") REFERENCES "internal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
