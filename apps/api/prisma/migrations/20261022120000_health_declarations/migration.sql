-- CreateTable
CREATE TABLE "health_declarations" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "document_version" VARCHAR(100) NOT NULL,
    "identity" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "consents" JSONB NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "health_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_declarations_person_id_submitted_at_idx" ON "health_declarations"("person_id", "submitted_at");

-- AddForeignKey
ALTER TABLE "health_declarations" ADD CONSTRAINT "health_declarations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Confirmed declarations cannot be overwritten, even through direct ORM updates.
ALTER TABLE "health_declarations" ADD CONSTRAINT "health_declarations_valid_period"
CHECK ("valid_until" > "submitted_at" AND length(btrim("document_version")) > 0);
ALTER TABLE "health_declarations" ADD CONSTRAINT "health_declarations_required_consents"
CHECK ("consents" @> '{"physicalActivity":true,"truthfulness":true,"emergenciesAndPrivacy":true}'::jsonb);
CREATE FUNCTION prevent_health_declaration_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Confirmed health declarations are immutable';
END;
$$;
CREATE TRIGGER health_declarations_immutable BEFORE UPDATE ON "health_declarations"
FOR EACH ROW EXECUTE FUNCTION prevent_health_declaration_update();
