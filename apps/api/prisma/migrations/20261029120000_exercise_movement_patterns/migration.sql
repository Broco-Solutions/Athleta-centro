-- AlterTable
ALTER TABLE "exercise_definitions" ADD COLUMN     "movement_pattern_id" UUID;

-- CreateTable
CREATE TABLE "exercise_movement_patterns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalized_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exercise_movement_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_movement_patterns_normalized_name_key" ON "exercise_movement_patterns"("normalized_name");

-- AddForeignKey
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_definitions_movement_pattern_id_fkey" FOREIGN KEY ("movement_pattern_id") REFERENCES "exercise_movement_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

