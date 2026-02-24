import type { NextConfig } from "next";

// Security headers are in public/_headers (Cloudflare Pages native format).
// next.config.ts headers() is not compatible with output: 'export'.

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'export',
};

export default nextConfig;
