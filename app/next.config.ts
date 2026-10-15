import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Không dùng next/font/google: sandbox/CI không có egress ra fonts.googleapis.com
  // (xem TOOLS.md). Dùng system font stack trong globals.css.
};

export default nextConfig;
