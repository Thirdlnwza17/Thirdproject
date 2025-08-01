import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://172.18.127.24:3000',
  ],
};

export default nextConfig;
