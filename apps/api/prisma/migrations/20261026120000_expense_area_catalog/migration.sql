CREATE TABLE "expense_area_catalog" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "is_selectable" BOOLEAN NOT NULL DEFAULT true,
    "system_code" "ExpenseArea",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expense_area_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_area_catalog_normalized_name_key" ON "expense_area_catalog"("normalized_name");
CREATE UNIQUE INDEX "expense_area_catalog_system_code_key" ON "expense_area_catalog"("system_code");

INSERT INTO "expense_area_catalog" ("id", "name", "normalized_name", "is_selectable", "system_code", "created_at", "updated_at") VALUES
    ('00000000-0000-4000-8000-00000000a001', 'Sala', 'sala', true, 'SALA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-00000000a002', 'General', 'general', true, 'GENERAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-00000000a003', 'Clínica', 'clínica', true, 'CLINIC', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DROP INDEX IF EXISTS "expenses_cash_date_area_idx";
ALTER TABLE "expenses" ADD COLUMN "area_id" UUID;
UPDATE "expenses" AS expense
SET "area_id" = catalog."id"
FROM "expense_area_catalog" AS catalog
WHERE catalog."system_code" = expense."area";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "expenses" WHERE "area_id" IS NULL) THEN
        RAISE EXCEPTION 'Expense area migration left rows without an area association';
    END IF;
END $$;

ALTER TABLE "expenses" ALTER COLUMN "area_id" SET NOT NULL;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "expense_area_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "expenses_cash_date_area_id_idx" ON "expenses"("cash_date", "area_id");
ALTER TABLE "expenses" DROP COLUMN "area";
