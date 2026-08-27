CREATE TABLE "payment_methods" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "is_selectable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "sala_payments" (
  "id" UUID NOT NULL, "person_id" UUID NOT NULL, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL,
  "paid_at" DATE NOT NULL, "amount" DECIMAL(14,0) NOT NULL, "payment_method_id" UUID NOT NULL,
  "registered_by_id" UUID NOT NULL, "operation_id" UUID NOT NULL, "adjustment_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL, "last_modified_by_id" UUID, "last_modified_at" TIMESTAMPTZ(6),
  CONSTRAINT "sala_payments_pkey" PRIMARY KEY ("id"), CONSTRAINT "sala_payments_month_check" CHECK ("month" BETWEEN 1 AND 12), CONSTRAINT "sala_payments_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "sala_payments_person_year_month_key" ON "sala_payments"("person_id","year","month");
CREATE UNIQUE INDEX "sala_payments_operation_id_key" ON "sala_payments"("operation_id");
CREATE INDEX "sala_payments_person_idx" ON "sala_payments"("person_id","year","month");
ALTER TABLE "sala_payments" ADD CONSTRAINT "sala_payments_person_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_payments" ADD CONSTRAINT "sala_payments_method_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_payments" ADD CONSTRAINT "sala_payments_user_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_payments" ADD CONSTRAINT "sala_payments_modified_fkey" FOREIGN KEY ("last_modified_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
