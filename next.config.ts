import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@hummusonrails/cci-pro"],
};

export default nextConfig;
