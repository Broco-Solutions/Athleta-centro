CREATE TABLE "people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "normalized_dni" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "email" TEXT,
    "normalized_email" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "social_work_id" UUID,
    "affiliate_number" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "people_normalized_dni_nonempty" CHECK (length("normalized_dni") > 0)
);

CREATE UNIQUE INDEX "people_normalized_dni_key" ON "people"("normalized_dni");
CREATE INDEX "people_last_name_first_name_idx" ON "people"("last_name", "first_name");
CREATE INDEX "people_normalized_email_idx" ON "people"("normalized_email");
