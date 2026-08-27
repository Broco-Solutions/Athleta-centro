-- DropForeignKey
ALTER TABLE "public"."fixed_sala_bookings" DROP CONSTRAINT "fixed_sala_bookings_participation_fkey";

-- DropForeignKey
ALTER TABLE "public"."fixed_sala_bookings" DROP CONSTRAINT "fixed_sala_bookings_person_fkey";

-- DropForeignKey
ALTER TABLE "public"."fixed_sala_bookings" DROP CONSTRAINT "fixed_sala_bookings_slot_fkey";

-- DropForeignKey
ALTER TABLE "public"."one_off_reservations" DROP CONSTRAINT "one_off_reservations_participation_fkey";

-- DropForeignKey
ALTER TABLE "public"."one_off_reservations" DROP CONSTRAINT "one_off_reservations_person_fkey";

-- DropForeignKey
ALTER TABLE "public"."one_off_reservations" DROP CONSTRAINT "one_off_reservations_slot_fkey";

-- DropForeignKey
ALTER TABLE "public"."sala_participations" DROP CONSTRAINT "sala_participations_person_fkey";

-- DropForeignKey
ALTER TABLE "public"."sala_participations" DROP CONSTRAINT "sala_participations_plan_fkey";

-- DropForeignKey
ALTER TABLE "public"."sala_participations" DROP CONSTRAINT "sala_participations_professor_fkey";

-- DropIndex
DROP INDEX "public"."sala_schedule_slots_active_idx";

-- AlterTable
ALTER TABLE "auth_attempt_buckets" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "people" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sala_occurrences" ALTER COLUMN "last_modified_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "clinical_attentions" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_attentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_attentions_appointment_id_key" ON "clinical_attentions"("appointment_id");

-- CreateIndex
CREATE INDEX "fixed_sala_bookings_sala_participation_id_idx" ON "fixed_sala_bookings"("sala_participation_id");

-- RenameForeignKey
ALTER TABLE "clinical_appointments" RENAME CONSTRAINT "clinical_appointments_person_fkey" TO "clinical_appointments_person_id_fkey";

-- RenameForeignKey
ALTER TABLE "clinical_appointments" RENAME CONSTRAINT "clinical_appointments_prof_fkey" TO "clinical_appointments_professional_id_fkey";

-- RenameForeignKey
ALTER TABLE "clinical_patients" RENAME CONSTRAINT "clinical_patients_person_fkey" TO "clinical_patients_person_id_fkey";

-- RenameForeignKey
ALTER TABLE "clinical_patients" RENAME CONSTRAINT "clinical_patients_user_fkey" TO "clinical_patients_registered_by_id_fkey";

-- RenameForeignKey
ALTER TABLE "sala_payments" RENAME CONSTRAINT "sala_payments_method_fkey" TO "sala_payments_payment_method_id_fkey";

-- RenameForeignKey
ALTER TABLE "sala_payments" RENAME CONSTRAINT "sala_payments_modified_fkey" TO "sala_payments_last_modified_by_id_fkey";

-- RenameForeignKey
ALTER TABLE "sala_payments" RENAME CONSTRAINT "sala_payments_person_fkey" TO "sala_payments_person_id_fkey";

-- RenameForeignKey
ALTER TABLE "sala_payments" RENAME CONSTRAINT "sala_payments_user_fkey" TO "sala_payments_registered_by_id_fkey";

-- AddForeignKey
ALTER TABLE "clinical_attentions" ADD CONSTRAINT "clinical_attentions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "clinical_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attentions" ADD CONSTRAINT "clinical_attentions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attentions" ADD CONSTRAINT "clinical_attentions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sala_participations" ADD CONSTRAINT "sala_participations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sala_participations" ADD CONSTRAINT "sala_participations_main_professor_id_fkey" FOREIGN KEY ("main_professor_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sala_participations" ADD CONSTRAINT "sala_participations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "sala_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_sala_bookings" ADD CONSTRAINT "fixed_sala_bookings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_sala_bookings" ADD CONSTRAINT "fixed_sala_bookings_sala_participation_id_fkey" FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_sala_bookings" ADD CONSTRAINT "fixed_sala_bookings_schedule_slot_id_fkey" FOREIGN KEY ("schedule_slot_id") REFERENCES "sala_schedule_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_off_reservations" ADD CONSTRAINT "one_off_reservations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_off_reservations" ADD CONSTRAINT "one_off_reservations_sala_participation_id_fkey" FOREIGN KEY ("sala_participation_id") REFERENCES "sala_participations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_off_reservations" ADD CONSTRAINT "one_off_reservations_schedule_slot_id_fkey" FOREIGN KEY ("schedule_slot_id") REFERENCES "sala_schedule_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "clinical_appointments_person_idx" RENAME TO "clinical_appointments_person_id_start_at_idx";

-- RenameIndex
ALTER INDEX "clinical_appointments_professional_idx" RENAME TO "clinical_appointments_professional_id_start_at_idx";

-- RenameIndex
ALTER INDEX "clinical_appointments_status_idx" RENAME TO "clinical_appointments_status_start_at_idx";

-- RenameIndex
ALTER INDEX "fixed_sala_bookings_slot_id_idx" RENAME TO "fixed_sala_bookings_schedule_slot_id_idx";

-- RenameIndex
ALTER INDEX "one_off_reservations_date_slot_idx" RENAME TO "one_off_reservations_date_schedule_slot_id_idx";

-- RenameIndex
ALTER INDEX "one_off_reservations_person_slot_date_key" RENAME TO "one_off_reservations_person_id_schedule_slot_id_date_key";

-- RenameIndex
ALTER INDEX "sala_payments_person_idx" RENAME TO "sala_payments_person_id_year_month_idx";

-- RenameIndex
ALTER INDEX "sala_payments_person_year_month_key" RENAME TO "sala_payments_person_id_year_month_key";
