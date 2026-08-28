ALTER TABLE "fixed_sala_bookings"
  ADD COLUMN "service_duration_minutes" INTEGER;

ALTER TABLE "one_off_reservations"
  ADD COLUMN "service_duration_minutes" INTEGER;

UPDATE "fixed_sala_bookings" booking
SET "service_duration_minutes" = service."duration_minutes"
FROM "sala_service_types" service
WHERE booking."service_type_id" = service."id";

UPDATE "one_off_reservations" booking
SET "service_duration_minutes" = service."duration_minutes"
FROM "sala_service_types" service
WHERE booking."service_type_id" = service."id";

ALTER TABLE "fixed_sala_bookings"
  ADD CONSTRAINT "fixed_sala_bookings_service_duration_minutes_check"
  CHECK ("service_duration_minutes" IS NULL OR ("service_duration_minutes" > 0 AND MOD("service_duration_minutes", 15) = 0));

ALTER TABLE "one_off_reservations"
  ADD CONSTRAINT "one_off_reservations_service_duration_minutes_check"
  CHECK ("service_duration_minutes" IS NULL OR ("service_duration_minutes" > 0 AND MOD("service_duration_minutes", 15) = 0));
