CREATE TABLE "social_works" ("id" UUID NOT NULL,"name" TEXT NOT NULL,"normalized_name" TEXT NOT NULL,"is_selectable" BOOLEAN NOT NULL DEFAULT true,"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "social_works_pkey" PRIMARY KEY("id"));
CREATE UNIQUE INDEX "social_works_normalized_name_key" ON "social_works"("normalized_name");
CREATE TABLE "social_work_orders" ("id" UUID NOT NULL,"person_id" UUID NOT NULL,"social_work_id" UUID NOT NULL,"reference" TEXT NOT NULL,"issue_date" DATE,"expiration_date" DATE,"file_asset_id" UUID,"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "social_work_orders_pkey" PRIMARY KEY("id"));
CREATE UNIQUE INDEX "social_work_orders_file_asset_id_key" ON "social_work_orders"("file_asset_id");
CREATE INDEX "social_work_orders_person_id_expiration_date_idx" ON "social_work_orders"("person_id","expiration_date");
ALTER TABLE "people" ADD CONSTRAINT "people_social_work_id_fkey" FOREIGN KEY("social_work_id") REFERENCES "social_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_work_orders" ADD CONSTRAINT "social_work_orders_person_id_fkey" FOREIGN KEY("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_work_orders" ADD CONSTRAINT "social_work_orders_social_work_id_fkey" FOREIGN KEY("social_work_id") REFERENCES "social_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_work_orders" ADD CONSTRAINT "social_work_orders_file_asset_id_fkey" FOREIGN KEY("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
