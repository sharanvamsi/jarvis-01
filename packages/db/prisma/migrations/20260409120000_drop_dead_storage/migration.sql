-- Drop dead storage: User.gradescopeConnected and RawApiSnapshot table.
-- gradescopeConnected is derivable from SyncToken {service: 'gradescope'},
-- and RawApiSnapshot has no read sites in application code.

-- DropForeignKey
ALTER TABLE "raw_api_snapshots" DROP CONSTRAINT IF EXISTS "raw_api_snapshots_user_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "raw_api_snapshots";

-- AlterTable
ALTER TABLE "users" DROP COLUMN IF EXISTS "gradescope_connected";
ALTER TABLE "deleted_users" DROP COLUMN IF EXISTS "gradescope_connected";
