ALTER TABLE "sala_schedule_slots"
  ADD CONSTRAINT "sala_schedule_slots_15_minute_grid_check"
  CHECK (
    "duration_minutes" > 0
    AND MOD("duration_minutes", 15) = 0
    AND MOD(EXTRACT(MINUTE FROM "start_time")::INTEGER, 15) = 0
  );

ALTER TABLE "fixed_sala_bookings"
  ADD CONSTRAINT "fixed_sala_bookings_start_time_grid_check"
  CHECK ("start_time" IS NULL OR MOD(EXTRACT(MINUTE FROM "start_time")::INTEGER, 15) = 0);

ALTER TABLE "one_off_reservations"
  ADD CONSTRAINT "one_off_reservations_start_time_grid_check"
  CHECK ("start_time" IS NULL OR MOD(EXTRACT(MINUTE FROM "start_time")::INTEGER, 15) = 0);
