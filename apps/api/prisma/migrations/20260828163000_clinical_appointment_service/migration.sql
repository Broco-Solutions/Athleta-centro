ALTER TABLE "clinical_appointments" ADD COLUMN "service_type_id" UUID;
ALTER TABLE "clinical_appointments" ADD CONSTRAINT "clinical_appointments_service_type_id_fkey"
  FOREIGN KEY ("service_type_id") REFERENCES "sala_service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "clinical_appointments_service_type_id_idx" ON "clinical_appointments"("service_type_id");
