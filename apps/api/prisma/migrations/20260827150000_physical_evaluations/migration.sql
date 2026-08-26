CREATE TABLE "physical_test_definitions" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "description" VARCHAR(500),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "physical_test_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "physical_test_definitions_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "physical_test_definitions_type_not_blank" CHECK (btrim("type") <> '')
);
CREATE TABLE "physical_evaluations" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "sala_participation_id" UUID NOT NULL,
  "professor_id" UUID NOT NULL,
  "evaluation_date" DATE NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "physical_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "physical_test_results" (
  "id" UUID NOT NULL,
  "evaluation_id" UUID NOT NULL,
  "test_definition_id" UUID NOT NULL,
  "result_text" VARCHAR(500) NOT NULL,
  CONSTRAINT "physical_test_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "physical_test_results_text_not_blank" CHECK (btrim("result_text") <> '')
);
CREATE UNIQUE INDEX "physical_test_definitions_name_key" ON "physical_test_definitions"("name");
CREATE INDEX "physical_evaluations_person_id_evaluation_date_idx" ON "physical_evaluations"("person_id", "evaluation_date");
CREATE INDEX "physical_test_results_test_definition_id_idx" ON "physical_test_results"("test_definition_id");
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_sala_participation_id_fkey" FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_test_results" ADD CONSTRAINT "physical_test_results_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "physical_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "physical_test_results" ADD CONSTRAINT "physical_test_results_test_definition_id_fkey" FOREIGN KEY ("test_definition_id") REFERENCES "physical_test_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
