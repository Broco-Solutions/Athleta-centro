CREATE TABLE "sala_participations" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "main_professor_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sala_participations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sala_participations_person_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT,
  CONSTRAINT "sala_participations_professor_fkey" FOREIGN KEY ("main_professor_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT,
  CONSTRAINT "sala_participations_plan_fkey" FOREIGN KEY ("plan_id") REFERENCES "sala_plans"("id") ON DELETE RESTRICT
);
CREATE INDEX "sala_participations_person_id_idx" ON "sala_participations"("person_id");
CREATE INDEX "sala_participations_main_professor_id_idx" ON "sala_participations"("main_professor_id");
CREATE INDEX "sala_participations_plan_id_idx" ON "sala_participations"("plan_id");
CREATE UNIQUE INDEX "sala_participations_one_active_per_person" ON "sala_participations"("person_id") WHERE "end_date" IS NULL;
