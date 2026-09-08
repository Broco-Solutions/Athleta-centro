-- Account ledger: domain-owned charges, immutable allocations, adjustments and reversals.
CREATE TYPE "ClinicalDiscipline" AS ENUM ('KINESIOLOGY', 'OSTEOPATHY');
CREATE TYPE "SalaChargeKind" AS ENUM ('MONTHLY', 'OPENING_BALANCE');
CREATE TYPE "FinancialAdjustmentKind" AS ENUM ('ADJUSTMENT', 'REVERSAL');
CREATE TYPE "ChargeResponsibility" AS ENUM ('PATIENT', 'SOCIAL_WORK');

CREATE TABLE "clinical_services" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalized_name" VARCHAR(120) NOT NULL,
  "discipline" "ClinicalDiscipline",
  "duration_minutes" INTEGER NOT NULL,
  "fee_ars" DECIMAL(14,0) NOT NULL,
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinical_services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_services_duration_positive" CHECK ("duration_minutes" > 0),
  CONSTRAINT "clinical_services_fee_nonnegative" CHECK ("fee_ars" >= 0)
);

-- Preserve every historical appointment service without inventing a clinical discipline or fee.
INSERT INTO "clinical_services" (
  "id", "name", "normalized_name", "discipline", "duration_minutes", "fee_ars", "is_available", "created_at", "updated_at"
)
SELECT DISTINCT st."id", st."name", st."normalized_name", NULL::"ClinicalDiscipline", st."duration_minutes", 0, false, st."created_at", st."updated_at"
FROM "sala_service_types" st
JOIN "clinical_appointments" appointment ON appointment."service_type_id" = st."id";

ALTER TABLE "clinical_appointments"
  DROP CONSTRAINT IF EXISTS "clinical_appointments_service_type_id_fkey";
DROP INDEX IF EXISTS "clinical_appointments_service_type_id_idx";
ALTER TABLE "clinical_appointments" RENAME COLUMN "service_type_id" TO "service_id";
CREATE INDEX "clinical_appointments_service_id_idx" ON "clinical_appointments"("service_id");
CREATE UNIQUE INDEX "clinical_services_normalized_name_key" ON "clinical_services"("normalized_name");
ALTER TABLE "clinical_appointments" ADD CONSTRAINT "clinical_appointments_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "clinical_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinical_attentions" ADD COLUMN "service_id" UUID;
UPDATE "clinical_attentions" attention
SET "service_id" = appointment."service_id"
FROM "clinical_appointments" appointment
WHERE attention."appointment_id" = appointment."id";
CREATE INDEX "clinical_attentions_service_id_idx" ON "clinical_attentions"("service_id");
ALTER TABLE "clinical_attentions" ADD CONSTRAINT "clinical_attentions_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "clinical_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sala_plan_assignments" (
  "id" UUID NOT NULL,
  "sala_participation_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "effective_from" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sala_plan_assignments_pkey" PRIMARY KEY ("id")
);
INSERT INTO "sala_plan_assignments" ("id", "sala_participation_id", "plan_id", "effective_from")
SELECT gen_random_uuid(), "id", "plan_id", "start_date" FROM "sala_participations";
CREATE UNIQUE INDEX "sala_plan_assignments_sala_participation_id_effective_from_key"
  ON "sala_plan_assignments"("sala_participation_id", "effective_from");
CREATE INDEX "sala_plan_assignments_plan_id_idx" ON "sala_plan_assignments"("plan_id");
ALTER TABLE "sala_plan_assignments" ADD CONSTRAINT "sala_plan_assignments_sala_participation_id_fkey"
  FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_plan_assignments" ADD CONSTRAINT "sala_plan_assignments_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "sala_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sala_billing_configuration" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "cutover_date" DATE NOT NULL,
  "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_run_at" TIMESTAMPTZ(6),
  CONSTRAINT "sala_billing_configuration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sala_charges" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "sala_participation_id" UUID,
  "plan_id" UUID,
  "kind" "SalaChargeKind" NOT NULL,
  "year" INTEGER,
  "month" INTEGER,
  "charge_date" DATE NOT NULL,
  "concept" VARCHAR(200) NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "plan_name_snapshot" VARCHAR(120),
  "operation_id" UUID,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sala_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sala_charges_amount_nonnegative" CHECK ("amount" >= 0),
  CONSTRAINT "sala_charges_month_valid" CHECK ("month" IS NULL OR "month" BETWEEN 1 AND 12),
  CONSTRAINT "sala_charges_kind_fields" CHECK (
    ("kind" = 'MONTHLY' AND "year" IS NOT NULL AND "month" IS NOT NULL AND "sala_participation_id" IS NOT NULL AND "plan_id" IS NOT NULL)
    OR ("kind" = 'OPENING_BALANCE' AND "year" IS NULL AND "month" IS NULL)
  )
);
CREATE UNIQUE INDEX "sala_charges_operation_id_key" ON "sala_charges"("operation_id");
CREATE UNIQUE INDEX "sala_charges_monthly_person_period_key"
  ON "sala_charges"("person_id", "year", "month") WHERE "kind" = 'MONTHLY';
CREATE INDEX "sala_charges_person_id_charge_date_idx" ON "sala_charges"("person_id", "charge_date");
CREATE INDEX "sala_charges_sala_participation_id_idx" ON "sala_charges"("sala_participation_id");
ALTER TABLE "sala_charges" ADD CONSTRAINT "sala_charges_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_charges" ADD CONSTRAINT "sala_charges_sala_participation_id_fkey" FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_charges" ADD CONSTRAINT "sala_charges_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "sala_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_charges" ADD CONSTRAINT "sala_charges_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sala_payment_allocations" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "charge_id" UUID NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sala_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sala_payment_allocations_amount_positive" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "sala_payment_allocations_operation_id_key" ON "sala_payment_allocations"("operation_id");
CREATE INDEX "sala_payment_allocations_payment_id_idx" ON "sala_payment_allocations"("payment_id");
CREATE INDEX "sala_payment_allocations_charge_id_idx" ON "sala_payment_allocations"("charge_id");
ALTER TABLE "sala_payment_allocations" ADD CONSTRAINT "sala_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "sala_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_payment_allocations" ADD CONSTRAINT "sala_payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "sala_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sala_charge_adjustments" (
  "id" UUID NOT NULL,
  "charge_id" UUID NOT NULL,
  "kind" "FinancialAdjustmentKind" NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "registered_by_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sala_charge_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sala_charge_adjustments_nonzero" CHECK ("amount" <> 0),
  CONSTRAINT "sala_charge_reversal_negative" CHECK ("kind" <> 'REVERSAL' OR "amount" < 0)
);
CREATE UNIQUE INDEX "sala_charge_adjustments_operation_id_key" ON "sala_charge_adjustments"("operation_id");
CREATE INDEX "sala_charge_adjustments_charge_id_idx" ON "sala_charge_adjustments"("charge_id");
ALTER TABLE "sala_charge_adjustments" ADD CONSTRAINT "sala_charge_adjustments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "sala_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_charge_adjustments" ADD CONSTRAINT "sala_charge_adjustments_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sala_payment_reversals" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "registered_by_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sala_payment_reversals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sala_payment_reversals_payment_id_key" ON "sala_payment_reversals"("payment_id");
CREATE UNIQUE INDEX "sala_payment_reversals_operation_id_key" ON "sala_payment_reversals"("operation_id");
ALTER TABLE "sala_payment_reversals" ADD CONSTRAINT "sala_payment_reversals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "sala_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_payment_reversals" ADD CONSTRAINT "sala_payment_reversals_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "sala_payments_person_id_year_month_key";

CREATE TABLE "clinical_charges" (
  "id" UUID NOT NULL,
  "attention_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "concept" VARCHAR(200) NOT NULL,
  "total_amount" DECIMAL(14,0) NOT NULL,
  "patient_amount" DECIMAL(14,0) NOT NULL,
  "social_work_amount" DECIMAL(14,0) NOT NULL,
  "social_work_id" UUID,
  "social_work_order_id" UUID,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_charges_amounts_nonnegative" CHECK ("total_amount" >= 0 AND "patient_amount" >= 0 AND "social_work_amount" >= 0),
  CONSTRAINT "clinical_charges_components_total" CHECK ("patient_amount" + "social_work_amount" = "total_amount"),
  CONSTRAINT "clinical_charges_social_work" CHECK ("social_work_amount" = 0 OR "social_work_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "clinical_charges_attention_id_key" ON "clinical_charges"("attention_id");
CREATE INDEX "clinical_charges_person_id_created_at_idx" ON "clinical_charges"("person_id", "created_at");
CREATE INDEX "clinical_charges_service_id_idx" ON "clinical_charges"("service_id");
CREATE INDEX "clinical_charges_social_work_id_idx" ON "clinical_charges"("social_work_id");
ALTER TABLE "clinical_charges" ADD CONSTRAINT "clinical_charges_attention_id_fkey" FOREIGN KEY ("attention_id") REFERENCES "clinical_attentions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_charges" ADD CONSTRAINT "clinical_charges_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_charges" ADD CONSTRAINT "clinical_charges_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "clinical_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_charges" ADD CONSTRAINT "clinical_charges_social_work_id_fkey" FOREIGN KEY ("social_work_id") REFERENCES "social_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_charges" ADD CONSTRAINT "clinical_charges_social_work_order_id_fkey" FOREIGN KEY ("social_work_order_id") REFERENCES "social_work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_charges" ADD CONSTRAINT "clinical_charges_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_income_allocations" (
  "id" UUID NOT NULL,
  "income_id" UUID NOT NULL,
  "charge_id" UUID NOT NULL,
  "responsibility" "ChargeResponsibility" NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_income_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_income_allocations_amount_positive" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "clinical_income_allocations_operation_id_key" ON "clinical_income_allocations"("operation_id");
CREATE INDEX "clinical_income_allocations_income_id_idx" ON "clinical_income_allocations"("income_id");
CREATE INDEX "clinical_income_allocations_charge_id_responsibility_idx" ON "clinical_income_allocations"("charge_id", "responsibility");
ALTER TABLE "clinical_income_allocations" ADD CONSTRAINT "clinical_income_allocations_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "clinical_incomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_income_allocations" ADD CONSTRAINT "clinical_income_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "clinical_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_charge_adjustments" (
  "id" UUID NOT NULL,
  "charge_id" UUID NOT NULL,
  "responsibility" "ChargeResponsibility" NOT NULL,
  "kind" "FinancialAdjustmentKind" NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "registered_by_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_charge_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_charge_adjustments_nonzero" CHECK ("amount" <> 0),
  CONSTRAINT "clinical_charge_reversal_negative" CHECK ("kind" <> 'REVERSAL' OR "amount" < 0)
);
CREATE UNIQUE INDEX "clinical_charge_adjustments_operation_id_key" ON "clinical_charge_adjustments"("operation_id");
CREATE INDEX "clinical_charge_adjustments_charge_id_responsibility_idx" ON "clinical_charge_adjustments"("charge_id", "responsibility");
ALTER TABLE "clinical_charge_adjustments" ADD CONSTRAINT "clinical_charge_adjustments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "clinical_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_charge_adjustments" ADD CONSTRAINT "clinical_charge_adjustments_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinical_income_reversals" (
  "id" UUID NOT NULL,
  "income_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "registered_by_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_income_reversals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinical_income_reversals_income_id_key" ON "clinical_income_reversals"("income_id");
CREATE UNIQUE INDEX "clinical_income_reversals_operation_id_key" ON "clinical_income_reversals"("operation_id");
ALTER TABLE "clinical_income_reversals" ADD CONSTRAINT "clinical_income_reversals_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "clinical_incomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_income_reversals" ADD CONSTRAINT "clinical_income_reversals_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
