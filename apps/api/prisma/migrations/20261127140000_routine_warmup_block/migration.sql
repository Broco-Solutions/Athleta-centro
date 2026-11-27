BEGIN;

-- Position zero identifies the warm-up. Positive positions keep their existing meaning.
ALTER TABLE "routine_template_exercises"
  DROP CONSTRAINT "chk_routine_template_exercises_block_position",
  ADD CONSTRAINT "chk_routine_template_exercises_block_position" CHECK ("block_position" IS NULL OR "block_position" >= 0);

ALTER TABLE "routine_exercises"
  DROP CONSTRAINT "chk_routine_exercises_block_position",
  ADD CONSTRAINT "chk_routine_exercises_block_position" CHECK ("block_position" IS NULL OR "block_position" >= 0);

ALTER TABLE "sala_training_record_exercises"
  DROP CONSTRAINT "chk_sala_training_record_exercises_block_position",
  ADD CONSTRAINT "chk_sala_training_record_exercises_block_position" CHECK ("block_position" IS NULL OR "block_position" >= 0);

COMMIT;
