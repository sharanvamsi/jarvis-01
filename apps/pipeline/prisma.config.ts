import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env" });

export default defineConfig({
  earlyAccess: true,
  schema: "../../packages/db/prisma/schema.prisma",
  migrations: {
    path: "../../packages/db/prisma/migrations",
  },
});
