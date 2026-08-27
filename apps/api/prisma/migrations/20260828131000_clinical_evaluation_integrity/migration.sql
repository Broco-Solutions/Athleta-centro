ALTER TABLE "clinical_protocols" ADD COLUMN "normalized_name" TEXT;
ALTER TABLE "clinical_test_definitions" ADD COLUMN "normalized_name" TEXT;
ALTER TABLE "measurement_methods" ADD COLUMN "normalized_name" TEXT;

UPDATE "clinical_protocols" SET "normalized_name" = lower(trim("name"));
UPDATE "clinical_test_definitions" SET "normalized_name" = lower(trim("name"));
UPDATE "measurement_methods" SET "normalized_name" = lower(trim("name"));

ALTER TABLE "clinical_protocols" ALTER COLUMN "normalized_name" SET NOT NULL;
ALTER TABLE "clinical_test_definitions" ALTER COLUMN "normalized_name" SET NOT NULL;
ALTER TABLE "measurement_methods" ALTER COLUMN "normalized_name" SET NOT NULL;

CREATE UNIQUE INDEX "clinical_protocols_normalized_name_key" ON "clinical_protocols"("normalized_name");
CREATE UNIQUE INDEX "clinical_test_definitions_normalized_name_key" ON "clinical_test_definitions"("normalized_name");
CREATE UNIQUE INDEX "measurement_methods_normalized_name_key" ON "measurement_methods"("normalized_name");

ALTER TABLE "clinical_test_definitions" ADD CONSTRAINT "clinical_test_definitions_scale_range_check"
CHECK ("scale_min" IS NULL OR "scale_max" IS NULL OR "scale_min" <= "scale_max");

ALTER TABLE "clinical_evaluations" ADD CONSTRAINT "clinical_evaluations_protocol_id_fkey"
FOREIGN KEY ("protocol_id") REFERENCES "clinical_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_evaluations" ADD CONSTRAINT "clinical_evaluations_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_evaluations" ADD CONSTRAINT "clinical_evaluations_last_modified_by_id_fkey"
FOREIGN KEY ("last_modified_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_test_results" ADD CONSTRAINT "clinical_test_results_test_definition_id_fkey"
FOREIGN KEY ("test_definition_id") REFERENCES "clinical_test_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_test_results" ADD CONSTRAINT "clinical_test_results_measurement_method_id_fkey"
FOREIGN KEY ("measurement_method_id") REFERENCES "measurement_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
