CREATE TABLE "sala_service_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalized_name" VARCHAR(120) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_selectable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "sala_service_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sala_service_types_duration_minutes_check"
      CHECK ("duration_minutes" > 0 AND MOD("duration_minutes", 15) = 0)
);

CREATE UNIQUE INDEX "sala_service_types_normalized_name_key"
  ON "sala_service_types"("normalized_name");

ALTER TABLE "fixed_sala_bookings"
  ADD COLUMN "service_type_id" UUID,
  ADD COLUMN "start_time" TIME(0);

ALTER TABLE "one_off_reservations"
  ADD COLUMN "service_type_id" UUID,
  ADD COLUMN "start_time" TIME(0);

CREATE INDEX "fixed_sala_bookings_service_type_id_idx"
  ON "fixed_sala_bookings"("service_type_id");
CREATE INDEX "one_off_reservations_service_type_id_idx"
  ON "one_off_reservations"("service_type_id");

ALTER TABLE "fixed_sala_bookings"
  ADD CONSTRAINT "fixed_sala_bookings_service_type_id_fkey"
  FOREIGN KEY ("service_type_id") REFERENCES "sala_service_types"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "one_off_reservations"
  ADD CONSTRAINT "one_off_reservations_service_type_id_fkey"
  FOREIGN KEY ("service_type_id") REFERENCES "sala_service_types"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
