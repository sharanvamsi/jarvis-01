-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "hard_due_date" TIMESTAMP(3),
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "user_assignments" ADD COLUMN     "max_score" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gradescope_connected" BOOLEAN NOT NULL DEFAULT false;
