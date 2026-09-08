ALTER TABLE "sala_plan_assignments"
  DROP CONSTRAINT "sala_plan_assignments_sala_participation_id_fkey";

ALTER TABLE "sala_plan_assignments"
  ADD CONSTRAINT "sala_plan_assignments_sala_participation_id_fkey"
  FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
