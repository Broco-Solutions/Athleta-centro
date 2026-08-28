-- Weekly availability is versioned: historical slots remain referenced by past bookings.
-- Only active windows must be unique for a weekday and time of day.
DROP INDEX "sala_schedule_slots_weekday_start_time_key";
CREATE UNIQUE INDEX "sala_schedule_slots_active_weekday_start_time_key"
  ON "sala_schedule_slots" ("weekday", "start_time")
  WHERE "is_active" = true;
