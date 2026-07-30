import type { NextConfig } from "next";
import { assertSafeProductionEnvironment } from "./src/lib/environment";

assertSafeProductionEnvironment();

const securityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://images.unsplash.com https://*.googleusercontent.com https://*.firebasestorage.app https://firebasestorage.googleapis.com",
      "media-src 'self' blob: https://*.firebasestorage.app https://firebasestorage.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.googletagmanager.com",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com https://*.cloudfunctions.net",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
