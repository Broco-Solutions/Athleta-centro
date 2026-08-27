CREATE TYPE "SalaClinicalIndicationStatus" AS ENUM ('ACTIVE','CLOSED');
CREATE TYPE "TrainingCondition" AS ENUM ('NO_RESTRICTIONS','RESTRICTED','DO_NOT_TRAIN');
CREATE TABLE "sala_clinical_indications" ("id" UUID NOT NULL,"person_id" UUID NOT NULL,"treatment_id" UUID,"responsible_professional_id" UUID NOT NULL,"training_condition" "TrainingCondition" NOT NULL,"affected_area" TEXT,"instructions" TEXT,"status" "SalaClinicalIndicationStatus" NOT NULL DEFAULT 'ACTIVE',"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMPTZ(6) NOT NULL,"closed_at" TIMESTAMPTZ(6),"closed_by_id" UUID,CONSTRAINT "sala_clinical_indications_pkey" PRIMARY KEY("id"));
CREATE INDEX "sala_clinical_indications_person_id_status_idx" ON "sala_clinical_indications"("person_id","status");
ALTER TABLE "sala_clinical_indications" ADD CONSTRAINT "sala_clinical_indications_person_id_fkey" FOREIGN KEY("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_clinical_indications" ADD CONSTRAINT "sala_clinical_indications_treatment_id_fkey" FOREIGN KEY("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_clinical_indications" ADD CONSTRAINT "sala_clinical_indications_professional_id_fkey" FOREIGN KEY("responsible_professional_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sala_clinical_indications" ADD CONSTRAINT "sala_clinical_indications_closed_by_id_fkey" FOREIGN KEY("closed_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
