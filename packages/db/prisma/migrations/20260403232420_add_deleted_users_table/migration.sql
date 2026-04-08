-- CreateTable
CREATE TABLE "deleted_users" (
    "id" TEXT NOT NULL,
    "original_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "current_semester" TEXT NOT NULL,
    "onboarding_done" BOOLEAN NOT NULL,
    "gradescope_connected" BOOLEAN NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "original_created_at" TIMESTAMP(3) NOT NULL,
    "original_updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletion_reason" TEXT,

    CONSTRAINT "deleted_users_pkey" PRIMARY KEY ("id")
);
