CREATE TABLE "file_assets" (
  "id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL,
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "file_assets_storage_key_key" ON "file_assets"("storage_key");
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_studies" ADD COLUMN "file_asset_id" UUID;
CREATE UNIQUE INDEX "clinical_studies_file_asset_id_key" ON "clinical_studies"("file_asset_id");
ALTER TABLE "clinical_studies" ADD CONSTRAINT "clinical_studies_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
