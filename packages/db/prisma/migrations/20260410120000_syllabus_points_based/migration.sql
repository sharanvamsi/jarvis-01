-- AlterTable
ALTER TABLE "syllabi" ADD COLUMN "is_points_based" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "syllabi" ADD COLUMN "total_points" DOUBLE PRECISION;
