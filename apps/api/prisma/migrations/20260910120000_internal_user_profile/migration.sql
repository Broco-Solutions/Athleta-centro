-- AlterTable
ALTER TABLE "internal_users"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "dni" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "birth_date" DATE,
  ADD COLUMN "profession" TEXT,
  ADD COLUMN "athleta_start_date" DATE;
