-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "TreatmentFinishReason" AS ENUM ('DISCHARGE', 'INTERRUPTION', 'REFERRAL', 'OTHER');

-- CreateTable
CREATE TABLE "treatments" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "responsible_professional_id" UUID NOT NULL,
    "consultation_reason" TEXT NOT NULL,
    "body_area_or_injury" TEXT NOT NULL,
    "objective" TEXT,
    "interventionPlan" TEXT,
    "start_date" DATE NOT NULL,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "finish_date" DATE,
    "finish_reason" "TreatmentFinishReason",
    "conclusion" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatments_person_id_status_idx" ON "treatments"("person_id", "status");

-- CreateIndex
CREATE INDEX "treatments_responsible_professional_id_status_idx" ON "treatments"("responsible_professional_id", "status");

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_responsible_professional_id_fkey" FOREIGN KEY ("responsible_professional_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
