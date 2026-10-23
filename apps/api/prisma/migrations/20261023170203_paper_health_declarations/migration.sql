-- CreateTable
CREATE TABLE "paper_health_declarations" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "signed_on" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_by" UUID NOT NULL,

    CONSTRAINT "paper_health_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paper_health_declarations_person_id_valid_until_idx" ON "paper_health_declarations"("person_id", "valid_until");

-- AddForeignKey
ALTER TABLE "paper_health_declarations" ADD CONSTRAINT "paper_health_declarations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_health_declarations" ADD CONSTRAINT "paper_health_declarations_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "paper_health_declarations"
  ADD CONSTRAINT "paper_health_declarations_validity_check" CHECK ("valid_until" > "signed_on");
CREATE TRIGGER paper_health_declarations_immutable BEFORE UPDATE ON "paper_health_declarations"
FOR EACH ROW EXECUTE FUNCTION prevent_health_declaration_update();

