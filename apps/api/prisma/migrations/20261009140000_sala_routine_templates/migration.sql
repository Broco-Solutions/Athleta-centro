-- CreateTable
CREATE TABLE "routine_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routine_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_template_days" (
    "id" UUID NOT NULL,
    "routine_template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(120),

    CONSTRAINT "routine_template_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_template_exercises" (
    "id" UUID NOT NULL,
    "routine_template_day_id" UUID NOT NULL,
    "exercise_definition_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "series" VARCHAR(80),
    "repetitions" VARCHAR(80),
    "duration" VARCHAR(80),
    "load" VARCHAR(80),
    "rest" VARCHAR(80),
    "notes" VARCHAR(500),

    CONSTRAINT "routine_template_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "routine_template_days_routine_template_id_position_key" ON "routine_template_days"("routine_template_id", "position");

-- CreateIndex
CREATE INDEX "routine_template_exercises_exercise_definition_id_idx" ON "routine_template_exercises"("exercise_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "routine_template_exercises_routine_template_day_id_position_key" ON "routine_template_exercises"("routine_template_day_id", "position");

-- AddForeignKey
ALTER TABLE "routine_template_days" ADD CONSTRAINT "routine_template_days_routine_template_id_fkey" FOREIGN KEY ("routine_template_id") REFERENCES "routine_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_template_exercises" ADD CONSTRAINT "routine_template_exercises_routine_template_day_id_fkey" FOREIGN KEY ("routine_template_day_id") REFERENCES "routine_template_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_template_exercises" ADD CONSTRAINT "routine_template_exercises_exercise_definition_id_fkey" FOREIGN KEY ("exercise_definition_id") REFERENCES "exercise_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

