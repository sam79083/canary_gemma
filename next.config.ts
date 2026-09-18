import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Small prod win with zero deploy changes (Render startCommand stays
  // `npm run start`). Standalone output intentionally NOT used — it would
  // require switching to `node .next/standalone/server.js`.
  compress: true,
};

export default nextConfig;
