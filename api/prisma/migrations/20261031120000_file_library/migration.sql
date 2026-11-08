-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('BROCHURE', 'PRICE_LIST', 'PRODUCT_IMAGE', 'SPEC_SHEET', 'WARRANTY', 'OTHER');

-- AlterTable
ALTER TABLE "lead_activities" ADD COLUMN     "attachments" JSONB;

-- CreateTable
CREATE TABLE "library_files" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "FileCategory" NOT NULL DEFAULT 'OTHER',
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_files_token_key" ON "library_files"("token");

-- CreateIndex
CREATE INDEX "library_files_category_title_idx" ON "library_files"("category", "title");

-- AddForeignKey
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

