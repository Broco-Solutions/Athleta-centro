-- The Treatment migration predates ClinicalAttention in clean installs. The
-- optional link is therefore added after both tables exist.
ALTER TABLE "clinical_attentions" ADD COLUMN IF NOT EXISTS "treatment_id" UUID;

DO $$ BEGIN
  ALTER TABLE "clinical_attentions"
    ADD CONSTRAINT "clinical_attentions_treatment_id_fkey"
    FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "treatments" ADD COLUMN "current_stage" TEXT;
