ALTER TABLE "sala_schedule_slots" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sala_schedule_slots" ADD COLUMN "ended_at" DATE;
CREATE INDEX "sala_schedule_slots_active_idx" ON "sala_schedule_slots"("is_active");
