ALTER TABLE "exercise_definitions"
ALTER COLUMN "primary_muscle" DROP NOT NULL;

ALTER TABLE "physical_test_definitions"
ALTER COLUMN "type" DROP NOT NULL;
