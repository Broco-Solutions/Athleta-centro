-- Direct retrospective attention is valid and must not require a fabricated Appointment.
ALTER TABLE "clinical_attentions" ALTER COLUMN "appointment_id" DROP NOT NULL;
