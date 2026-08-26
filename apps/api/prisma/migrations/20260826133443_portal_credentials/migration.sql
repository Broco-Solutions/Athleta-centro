-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "person_id" UUID;

-- CreateTable
CREATE TABLE "portal_credentials" (
    "person_id" UUID NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "must_change_pin" BOOLEAN NOT NULL DEFAULT true,
    "credentials_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_credentials_pkey" PRIMARY KEY ("person_id")
);

-- CreateIndex
CREATE INDEX "sessions_person_id_idx" ON "sessions"("person_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_credentials" ADD CONSTRAINT "portal_credentials_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
