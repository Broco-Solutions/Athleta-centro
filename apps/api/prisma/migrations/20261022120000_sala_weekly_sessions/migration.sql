ALTER TABLE "sala_plans" ADD COLUMN "weekly_sessions" INTEGER NULL;

ALTER TABLE "sala_plans" ADD CONSTRAINT "chk_sala_plans_weekly_sessions"
  CHECK ("weekly_sessions" IS NULL OR "weekly_sessions" BETWEEN 2 AND 5);
