import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "princess-stifle-cultural.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
};

export default nextConfig;
