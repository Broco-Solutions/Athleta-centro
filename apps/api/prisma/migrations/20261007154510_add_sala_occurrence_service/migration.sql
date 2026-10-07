-- AlterTable
ALTER TABLE "sala_occurrences" ADD COLUMN "service_type_id" UUID,
ADD COLUMN "service_duration_minutes" INTEGER;

-- CreateIndex
CREATE INDEX "sala_occurrences_service_type_id_idx" ON "sala_occurrences"("service_type_id");

-- AddForeignKey
ALTER TABLE "sala_occurrences" ADD CONSTRAINT "sala_occurrences_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "sala_service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
