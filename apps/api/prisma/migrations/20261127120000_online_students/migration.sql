BEGIN;

CREATE TABLE "online_students" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "professor_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    CONSTRAINT "online_students_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "online_students_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "online_students_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "online_students_id_person_id_key" ON "online_students"("id", "person_id");
CREATE UNIQUE INDEX "online_students_one_active_per_person" ON "online_students"("person_id") WHERE "end_date" IS NULL;
CREATE INDEX "online_students_person_id_idx" ON "online_students"("person_id");
CREATE INDEX "online_students_professor_id_idx" ON "online_students"("professor_id");
CREATE UNIQUE INDEX "sala_participations_id_person_id_key" ON "sala_participations"("id", "person_id");

ALTER TABLE "routines" ALTER COLUMN "sala_participation_id" DROP NOT NULL,
    ADD COLUMN "online_student_id" UUID;

-- Preserve each historical enrollment and the professor responsible for it.
INSERT INTO "online_students" ("id", "person_id", "professor_id", "start_date", "end_date")
SELECT p."id", p."person_id", p."main_professor_id", p."start_date", p."end_date"
FROM "sala_participations" p
JOIN "sala_plans" plan ON plan."id" = p."plan_id"
WHERE plan."is_online";

UPDATE "routines" r
SET "online_student_id" = r."sala_participation_id", "sala_participation_id" = NULL
FROM "online_students" s
WHERE r."sala_participation_id" = s."id";

-- Close the legacy links without changing their historical references.
UPDATE "sala_participations" p
SET "end_date" = GREATEST(p."start_date", (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
FROM "online_students" s
WHERE p."id" = s."id" AND p."end_date" IS NULL;

ALTER TABLE "routines" DROP CONSTRAINT "routines_sala_participation_id_fkey",
    ADD CONSTRAINT "routines_sala_participation_id_person_id_fkey" FOREIGN KEY ("sala_participation_id", "person_id") REFERENCES "sala_participations"("id", "person_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "routines_online_student_id_person_id_fkey" FOREIGN KEY ("online_student_id", "person_id") REFERENCES "online_students"("id", "person_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "routines_one_owner_check" CHECK (num_nonnulls("sala_participation_id", "online_student_id") = 1);

CREATE INDEX "routines_online_student_id_idx" ON "routines"("online_student_id");
DROP INDEX "routines_one_active_per_person";
CREATE UNIQUE INDEX "routines_one_active_in_person" ON "routines"("person_id") WHERE "status" = 'ACTIVE' AND "sala_participation_id" IS NOT NULL;
CREATE UNIQUE INDEX "routines_one_active_online" ON "routines"("online_student_id") WHERE "status" = 'ACTIVE' AND "online_student_id" IS NOT NULL;

COMMIT;
