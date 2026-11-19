-- CreateTable
CREATE TABLE "_TemplateFiles" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_TemplateFiles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TemplateFiles_B_index" ON "_TemplateFiles"("B");

-- AddForeignKey
ALTER TABLE "_TemplateFiles" ADD CONSTRAINT "_TemplateFiles_A_fkey" FOREIGN KEY ("A") REFERENCES "library_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TemplateFiles" ADD CONSTRAINT "_TemplateFiles_B_fkey" FOREIGN KEY ("B") REFERENCES "message_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
