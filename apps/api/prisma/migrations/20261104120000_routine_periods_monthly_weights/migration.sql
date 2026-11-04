ALTER TABLE "routines" ADD COLUMN "effective_from" DATE;
UPDATE "routines" SET "effective_from" = ("created_at" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
ALTER TABLE "routines" ALTER COLUMN "effective_from" SET NOT NULL;
CREATE INDEX "routines_person_id_effective_from_version_idx" ON "routines"("person_id", "effective_from", "version");
ALTER TABLE "sala_training_records" ALTER COLUMN "date" DROP NOT NULL,
 ADD COLUMN "month" VARCHAR(7), ADD COLUMN "week_number" INTEGER,
 ADD CONSTRAINT "training_week_number_valid" CHECK ("week_number" BETWEEN 1 AND 6),
 ADD CONSTRAINT "training_month_valid" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("month", 4) <> '0000'),
 ADD CONSTRAINT "training_record_identity_valid" CHECK (
   ("date" IS NOT NULL AND "month" IS NULL AND "week_number" IS NULL) OR
   ("date" IS NULL AND "month" IS NOT NULL AND "week_number" IS NOT NULL));
CREATE UNIQUE INDEX "sala_training_records_monthly_key" ON "sala_training_records"("person_id", "routine_id", "routine_day_id", "month", "week_number");
