ALTER TABLE "sala_occurrences" ADD COLUMN "created_by" UUID;
ALTER TABLE "sala_schedule_slots" ADD COLUMN "starts_at" DATE NOT NULL DEFAULT DATE '1970-01-01';

UPDATE "sala_occurrences"
SET "created_by" = "last_modified_by"
WHERE "created_by" IS NULL;

ALTER TABLE "sala_occurrences" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "sala_occurrences" ALTER COLUMN "last_modified_by" SET NOT NULL;

ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_fixed_sala_booking_id_fkey" FOREIGN KEY ("fixed_sala_booking_id") REFERENCES "fixed_sala_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_one_off_reservation_id_fkey" FOREIGN KEY ("one_off_reservation_id") REFERENCES "one_off_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_origin_source_check" CHECK (
  ("origin" = 'FIXED' AND "fixed_sala_booking_id" IS NOT NULL AND "one_off_reservation_id" IS NULL)
  OR ("origin" = 'ONE_OFF' AND "fixed_sala_booking_id" IS NULL AND "one_off_reservation_id" IS NOT NULL)
  OR ("origin" = 'SPONTANEOUS' AND "fixed_sala_booking_id" IS NULL AND "one_off_reservation_id" IS NULL)
);
