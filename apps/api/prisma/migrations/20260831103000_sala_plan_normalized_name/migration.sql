-- Catalog names are case- and whitespace-insensitive without duplicating a derived field.
CREATE UNIQUE INDEX "sala_plans_normalized_name_key" ON "sala_plans" (lower(btrim("name")));
