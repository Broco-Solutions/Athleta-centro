-- CreateTable
CREATE TABLE "sala_training_records" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "routine_id" UUID NOT NULL,
    "routine_day_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "day_name" VARCHAR(120),
    "day_position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sala_training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sala_training_record_exercises" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "routine_exercise_id" UUID NOT NULL,
    "exercise_definition_id" UUID NOT NULL,
    "exercise_name" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL,
    "series" VARCHAR(80),
    "repetitions" VARCHAR(80),
    "duration" VARCHAR(80),
    "load" VARCHAR(80),
    "rest" VARCHAR(80),
    "notes" VARCHAR(500),
    "weight_kg" DECIMAL(65,30),

    CONSTRAINT "sala_training_record_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sala_training_records_person_id_date_id_idx" ON "sala_training_records"("person_id", "date", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sala_training_records_person_id_date_routine_day_id_key" ON "sala_training_records"("person_id", "date", "routine_day_id");

-- CreateIndex
CREATE INDEX "sala_training_record_exercises_exercise_definition_id_recor_idx" ON "sala_training_record_exercises"("exercise_definition_id", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "sala_training_record_exercises_record_id_position_key" ON "sala_training_record_exercises"("record_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "sala_training_record_exercises_record_id_routine_exercise_i_key" ON "sala_training_record_exercises"("record_id", "routine_exercise_id");

-- AddForeignKey
ALTER TABLE "sala_training_records" ADD CONSTRAINT "sala_training_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sala_training_records" ADD CONSTRAINT "sala_training_records_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sala_training_record_exercises" ADD CONSTRAINT "sala_training_record_exercises_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "sala_training_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nullable means no weight declared. Guard direct database writes as well.
ALTER TABLE "sala_training_record_exercises"
  ADD CONSTRAINT "sala_training_weight_nonnegative_finite"
  CHECK ("weight_kg" IS NULL OR ("weight_kg" >= 0 AND "weight_kg" < 'NaN'::numeric));
