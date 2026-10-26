-- Existing rows are preserved. The partial index protects active bookings at their
-- actual start while allowing distinct starts within a weekly opening window.
DROP INDEX "one_off_reservations_person_id_schedule_slot_id_date_key";
CREATE INDEX "one_off_reservations_person_id_date_idx" ON "one_off_reservations"("person_id", "date");
CREATE UNIQUE INDEX "uq_one_off_reservations_active_start" ON "one_off_reservations"
  ("person_id", "schedule_slot_id", "date", COALESCE("start_time", '00:00'::time))
  WHERE "cancelled_at" IS NULL;

DROP INDEX "sala_occurrences_person_id_schedule_slot_id_date_key";
ALTER TABLE "sala_occurrences"
  ADD COLUMN "cancelled_for_non_payment_at" TIMESTAMPTZ(6),
  ALTER COLUMN "created_by" DROP NOT NULL,
  ALTER COLUMN "last_modified_by" DROP NOT NULL;
CREATE UNIQUE INDEX "sala_occurrences_fixed_sala_booking_id_date_key"
  ON "sala_occurrences"("fixed_sala_booking_id", "date");
CREATE UNIQUE INDEX "sala_occurrences_one_off_reservation_id_date_key"
  ON "sala_occurrences"("one_off_reservation_id", "date");
CREATE UNIQUE INDEX "uq_sala_occurrences_spontaneous_start" ON "sala_occurrences"
  ("person_id", "schedule_slot_id", "date", COALESCE("start_time", '00:00'::time))
  WHERE "origin" = 'SPONTANEOUS';

INSERT INTO "sala_configuration" ("id", "general_capacity", "updated_at")
VALUES ('default', 10, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
