CREATE TABLE "fixed_sala_bookings" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "sala_participation_id" UUID NOT NULL,
  "schedule_slot_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fixed_sala_bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fixed_sala_bookings_person_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT,
  CONSTRAINT "fixed_sala_bookings_participation_fkey" FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT,
  CONSTRAINT "fixed_sala_bookings_slot_fkey" FOREIGN KEY ("schedule_slot_id") REFERENCES "sala_schedule_slots"("id") ON DELETE RESTRICT,
  CONSTRAINT "fixed_sala_bookings_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);
CREATE INDEX "fixed_sala_bookings_person_id_idx" ON "fixed_sala_bookings"("person_id");
CREATE INDEX "fixed_sala_bookings_slot_id_idx" ON "fixed_sala_bookings"("schedule_slot_id");
CREATE TABLE "one_off_reservations" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "sala_participation_id" UUID NOT NULL,
  "schedule_slot_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "one_off_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "one_off_reservations_person_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT,
  CONSTRAINT "one_off_reservations_participation_fkey" FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT,
  CONSTRAINT "one_off_reservations_slot_fkey" FOREIGN KEY ("schedule_slot_id") REFERENCES "sala_schedule_slots"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "one_off_reservations_person_slot_date_key" ON "one_off_reservations"("person_id", "schedule_slot_id", "date");
CREATE INDEX "one_off_reservations_date_slot_idx" ON "one_off_reservations"("date", "schedule_slot_id");
