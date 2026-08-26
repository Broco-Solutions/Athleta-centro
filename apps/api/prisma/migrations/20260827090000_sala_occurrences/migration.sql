CREATE TYPE "SalaOccurrenceOrigin" AS ENUM ('FIXED', 'ONE_OFF', 'SPONTANEOUS');
CREATE TYPE "SalaOccurrenceStatus" AS ENUM ('RESERVED', 'ATTENDED', 'CANCELLED', 'ABSENT');
CREATE TABLE "sala_occurrences" ("id" UUID NOT NULL, "person_id" UUID NOT NULL, "schedule_slot_id" UUID NOT NULL, "date" DATE NOT NULL, "origin" "SalaOccurrenceOrigin" NOT NULL, "status" "SalaOccurrenceStatus" NOT NULL, "fixed_sala_booking_id" UUID, "one_off_reservation_id" UUID, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "last_modified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "last_modified_by" UUID, CONSTRAINT "sala_occurrences_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "sala_occurrences_person_id_schedule_slot_id_date_key" ON "sala_occurrences"("person_id","schedule_slot_id","date");
CREATE INDEX "sala_occurrences_date_schedule_slot_id_idx" ON "sala_occurrences"("date","schedule_slot_id");
ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_schedule_slot_id_fkey" FOREIGN KEY ("schedule_slot_id") REFERENCES "sala_schedule_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
