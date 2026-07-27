import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_STATIC_EXPORT === "true" ? "export" : undefined,
  allowedDevOrigins: ["127.0.0.1", "192.168.1.74", "192.168.1.78"],
  // The dev-tools indicator docks bottom-left and overlaps the mobile bottom nav; move it
  // to the bottom-right in development so it never covers a real destination.
  devIndicators: { position: "bottom-right" },
  images: {
    // The current Next stable line still pins a vulnerable sharp release. The public
    // build serves trusted source images directly until Next ships the patched runtime.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
