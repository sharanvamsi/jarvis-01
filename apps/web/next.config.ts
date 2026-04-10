import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  outputFileTracingIncludes: {
    "/**": ["../../packages/db/generated/prisma/*.node"],
  },
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
