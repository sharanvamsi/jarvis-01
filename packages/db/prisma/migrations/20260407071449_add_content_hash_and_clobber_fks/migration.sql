-- AlterTable
ALTER TABLE "clobber_policies" ADD COLUMN     "source_group_id" TEXT,
ADD COLUMN     "target_group_id" TEXT;

-- AlterTable
ALTER TABLE "sync_metadata" ADD COLUMN     "content_hash" TEXT;

-- AddForeignKey
ALTER TABLE "clobber_policies" ADD CONSTRAINT "clobber_policies_source_group_id_fkey" FOREIGN KEY ("source_group_id") REFERENCES "component_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clobber_policies" ADD CONSTRAINT "clobber_policies_target_group_id_fkey" FOREIGN KEY ("target_group_id") REFERENCES "component_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
