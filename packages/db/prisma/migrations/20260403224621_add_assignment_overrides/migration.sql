-- CreateTable
CREATE TABLE "assignment_overrides" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exclude_from_calc" BOOLEAN NOT NULL DEFAULT false,
    "override_max_score" DOUBLE PRECISION,
    "override_due_date" TIMESTAMP(3),
    "override_group_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignment_overrides_user_id_idx" ON "assignment_overrides"("user_id");

-- CreateIndex
CREATE INDEX "assignment_overrides_assignment_id_idx" ON "assignment_overrides"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_overrides_assignment_id_user_id_key" ON "assignment_overrides"("assignment_id", "user_id");

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
