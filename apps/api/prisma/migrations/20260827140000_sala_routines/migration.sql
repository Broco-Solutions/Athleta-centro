CREATE TYPE "RoutineStatus" AS ENUM ('ACTIVE', 'HISTORICAL');

CREATE TABLE "exercise_definitions" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "primary_muscle" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_definitions_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "exercise_definitions_primary_muscle_not_blank" CHECK (btrim("primary_muscle") <> '')
);

CREATE TABLE "routines" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "sala_participation_id" UUID NOT NULL,
  "status" "RoutineStatus" NOT NULL,
  "version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "routines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "routines_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "routine_days" (
  "id" UUID NOT NULL,
  "routine_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "name" VARCHAR(120),
  CONSTRAINT "routine_days_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "routine_days_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "routine_exercises" (
  "id" UUID NOT NULL,
  "routine_day_id" UUID NOT NULL,
  "exercise_definition_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "series" VARCHAR(80),
  "repetitions" VARCHAR(80),
  "duration" VARCHAR(80),
  "load" VARCHAR(80),
  "rest" VARCHAR(80),
  "notes" VARCHAR(500),
  CONSTRAINT "routine_exercises_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "routine_exercises_position_positive" CHECK ("position" > 0),
  CONSTRAINT "routine_exercises_repetitions_or_duration" CHECK ("repetitions" IS NULL OR "duration" IS NULL)
);

CREATE UNIQUE INDEX "exercise_definitions_name_key" ON "exercise_definitions"("name");
CREATE UNIQUE INDEX "routines_person_id_version_key" ON "routines"("person_id", "version");
CREATE UNIQUE INDEX "routines_one_active_per_person" ON "routines"("person_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "routines_sala_participation_id_idx" ON "routines"("sala_participation_id");
CREATE UNIQUE INDEX "routine_days_routine_id_position_key" ON "routine_days"("routine_id", "position");
CREATE UNIQUE INDEX "routine_exercises_routine_day_id_position_key" ON "routine_exercises"("routine_day_id", "position");
CREATE INDEX "routine_exercises_exercise_definition_id_idx" ON "routine_exercises"("exercise_definition_id");

ALTER TABLE "routines" ADD CONSTRAINT "routines_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "routines" ADD CONSTRAINT "routines_sala_participation_id_fkey" FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_day_id_fkey" FOREIGN KEY ("routine_day_id") REFERENCES "routine_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_definition_id_fkey" FOREIGN KEY ("exercise_definition_id") REFERENCES "exercise_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
