-- Coverage is backfilled in the original payment chronology, including reversed payments.
ALTER TABLE "sala_payments"
  ADD COLUMN "coverage_start_date" DATE,
  ADD COLUMN "coverage_end_date" DATE,
  ADD COLUMN "plan_id" UUID,
  ADD COLUMN "plan_name_snapshot" VARCHAR(120);

DO $$
DECLARE
  payment RECORD;
  previous_person UUID;
  previous_end DATE;
  coverage_start DATE;
  coverage_end DATE;
BEGIN
  FOR payment IN SELECT id, person_id, paid_at FROM sala_payments
    ORDER BY person_id, paid_at ASC, created_at ASC, id ASC
  LOOP
    IF previous_person = payment.person_id AND previous_end >= payment.paid_at THEN
      coverage_start := previous_end + 1;
      coverage_end := (previous_end + INTERVAL '1 month')::date;
    ELSE
      coverage_start := payment.paid_at;
      coverage_end := (payment.paid_at + INTERVAL '1 month')::date;
    END IF;
    UPDATE sala_payments SET coverage_start_date = coverage_start, coverage_end_date = coverage_end WHERE id = payment.id;
    previous_person := payment.person_id;
    previous_end := coverage_end;
  END LOOP;
END $$;

ALTER TABLE "sala_payments"
  ALTER COLUMN "coverage_start_date" SET NOT NULL,
  ALTER COLUMN "coverage_end_date" SET NOT NULL,
  ADD CONSTRAINT "sala_payments_coverage_check" CHECK ("coverage_start_date" <= "coverage_end_date"),
  ADD CONSTRAINT "sala_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "sala_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "sala_payments_person_id_coverage_start_date_coverage_end_date_idx"
  ON "sala_payments"("person_id", "coverage_start_date", "coverage_end_date");
