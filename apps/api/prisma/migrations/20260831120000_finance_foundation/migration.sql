-- Finance foundation: source movements remain separate aggregates.
CREATE TYPE "ExpenseArea" AS ENUM ('SALA', 'CLINIC', 'GENERAL');
CREATE TYPE "ClinicalIncomePayer" AS ENUM ('PATIENT', 'SOCIAL_WORK');

CREATE TABLE "expense_categories" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "is_selectable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "expenses" (
  "id" UUID NOT NULL,
  "cash_date" DATE NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "category_id" UUID NOT NULL,
  "payment_method_id" UUID NOT NULL,
  "area" "ExpenseArea" NOT NULL,
  "description" TEXT,
  "registered_by_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "clinical_incomes" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "cash_date" DATE NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "payment_method_id" UUID NOT NULL,
  "payer" "ClinicalIncomePayer" NOT NULL,
  "social_work_id" UUID,
  "attention_id" UUID,
  "social_work_order_id" UUID,
  "observation" TEXT,
  "registered_by_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinical_incomes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "exchange_rates" (
  "id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "rate" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "expense_categories_normalized_name_key" ON "expense_categories"("normalized_name");
CREATE UNIQUE INDEX "expenses_operation_id_key" ON "expenses"("operation_id");
CREATE INDEX "expenses_cash_date_area_idx" ON "expenses"("cash_date", "area");
CREATE UNIQUE INDEX "clinical_incomes_operation_id_key" ON "clinical_incomes"("operation_id");
CREATE INDEX "clinical_incomes_cash_date_person_id_idx" ON "clinical_incomes"("cash_date", "person_id");
CREATE UNIQUE INDEX "exchange_rates_year_month_key" ON "exchange_rates"("year", "month");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_incomes" ADD CONSTRAINT "clinical_incomes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_incomes" ADD CONSTRAINT "clinical_incomes_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_incomes" ADD CONSTRAINT "clinical_incomes_social_work_id_fkey" FOREIGN KEY ("social_work_id") REFERENCES "social_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_incomes" ADD CONSTRAINT "clinical_incomes_attention_id_fkey" FOREIGN KEY ("attention_id") REFERENCES "clinical_attentions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_incomes" ADD CONSTRAINT "clinical_incomes_social_work_order_id_fkey" FOREIGN KEY ("social_work_order_id") REFERENCES "social_work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_incomes" ADD CONSTRAINT "clinical_incomes_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
