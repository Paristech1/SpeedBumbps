import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
    minimumCacheTTL: 60,
  },
  // The geocode route reads the City address index from disk at runtime
  outputFileTracingIncludes: {
    '/api/geocode': ['./data/address-index/**/*'],
  },
};

export default nextConfig;
