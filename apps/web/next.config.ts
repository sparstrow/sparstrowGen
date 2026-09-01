import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@sparstrow/ui", "@sparstrow/shared"],
};

export default nextConfig;
