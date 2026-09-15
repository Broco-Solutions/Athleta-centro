-- Coverage is nullable only to preserve historical attentions whose coverage
-- cannot be inferred. Application services require it for every new attention.
CREATE TYPE "ClinicalCoverage" AS ENUM ('PRIVATE', 'SOCIAL_WORK');

ALTER TABLE "clinical_attentions"
  ADD COLUMN "coverage" "ClinicalCoverage";
