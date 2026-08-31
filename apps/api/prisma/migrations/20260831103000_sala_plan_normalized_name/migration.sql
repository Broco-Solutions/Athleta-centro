-- Existing installations may contain historical duplicate names. Keep the oldest
-- plan selectable and retire the rest so history remains queryable while the
-- catalog invariant is enforced for selectable plans.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY lower(btrim(name)) ORDER BY created_at, id) AS position
  FROM sala_plans
)
UPDATE sala_plans
SET is_selectable = false
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX "sala_plans_normalized_name_key"
  ON "sala_plans" (lower(btrim("name")))
  WHERE "is_selectable" = true;
