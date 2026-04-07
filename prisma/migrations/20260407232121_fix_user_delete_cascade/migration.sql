-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "created_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "exam_stats" ADD COLUMN     "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_stats" ADD CONSTRAINT "exam_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
