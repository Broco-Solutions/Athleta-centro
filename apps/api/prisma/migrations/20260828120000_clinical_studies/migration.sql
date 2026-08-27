CREATE TABLE "clinical_studies" ("id" UUID NOT NULL,"person_id" UUID NOT NULL,"treatment_id" UUID,"study_date" DATE NOT NULL,"study_type" TEXT NOT NULL,"description" TEXT,"file_name" TEXT,"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "clinical_studies_pkey" PRIMARY KEY ("id"));
CREATE INDEX "clinical_studies_person_id_study_date_idx" ON "clinical_studies"("person_id","study_date");
ALTER TABLE "clinical_studies" ADD CONSTRAINT "clinical_studies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_studies" ADD CONSTRAINT "clinical_studies_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
