import type { NextConfig } from "next";
import { assertSafeProductionEnvironment } from "./src/lib/environment";

assertSafeProductionEnvironment();

/**
 * Content Security Policy, in two headers with different jobs.
 *
 * This was a single `Content-Security-Policy-Report-Only` header, which enforces nothing —
 * it collects violations and allows the request. It also permitted `'unsafe-eval'`, so even
 * once enforced it would have given away most of the XSS containment it exists to provide.
 *
 * The split below is deliberate:
 *
 *   - The ENFORCED policy is what the browser actually applies. `'unsafe-eval'` is gone from
 *     it in production, which is the single biggest containment win available without
 *     restructuring how scripts load.
 *
 *   - The REPORT-ONLY policy is the stricter one we intend to enforce next: no
 *     `'unsafe-inline'` for scripts. It cannot be enforced yet because Next injects inline
 *     bootstrap and hydration scripts, and blocking those breaks the app rather than
 *     hardening it. Getting there needs per-request nonces threaded through middleware and
 *     the document; running it report-only first is how you find out what breaks before
 *     users do, instead of after.
 *
 * Development keeps the permissive policy unenforced: Turbopack's dev runtime genuinely
 * needs `eval`, and a dev-only enforcement failure teaches nothing about production.
 */
const isProduction = process.env.NODE_ENV === "production";

const SHARED_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.googleusercontent.com https://*.firebasestorage.app https://firebasestorage.googleapis.com",
  "media-src 'self' blob: https://*.firebasestorage.app https://firebasestorage.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com https://*.cloudfunctions.net",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'self' https://*.firebaseapp.com",
];

/*
 * `apis.google.com` is Firebase Auth, not an analytics extra.
 *
 * The SDK loads `apis.google.com/js/api.js` to host the auth iframe that `frame-src` above
 * already anticipates, and the policy was allowing the frame while blocking the script that
 * creates it. Live page loads carried the violation in the console.
 */
/** Applied by the browser. `unsafe-eval` is dropped in production. */
const enforcedPolicy = [
  ...SHARED_DIRECTIVES,
  isProduction
    ? "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googletagmanager.com https://apis.google.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.googletagmanager.com https://apis.google.com",
].join("; ");

/** The next step, collected as violations before it is ever enforced. */
const proposedPolicy = [
  ...SHARED_DIRECTIVES,
  "script-src 'self' https://www.gstatic.com https://www.googletagmanager.com https://apis.google.com",
].join("; ");

const securityHeaders = [
  // Enforced only in production: the dev runtime needs eval, and a dev-only enforcement
  // failure would teach nothing about what production actually does.
  ...(isProduction ? [{ key: "Content-Security-Policy", value: enforcedPolicy }] : []),
  { key: "Content-Security-Policy-Report-Only", value: proposedPolicy },
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
  // Environment readiness is read from the App Hosting config files at request time, and
  // those live at the repo root — nothing in the import graph points at them, so the tracer
  // cannot find them on its own. Without this the deployed server would report
  // "Configuration file is missing", which is a verdict about what got packaged rather than
  // about whether the environment is configured. The Control Plane and the activation
  // workflow must not be able to say that.
  outputFileTracingIncludes: {
    "/api/platform/control-plane": ["./apphosting.beta.yaml", "./apphosting.production.yaml"],
    "/api/platform/environment-activation": ["./apphosting.beta.yaml", "./apphosting.production.yaml"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        /**
         * The service worker is never cached.
         *
         * A cached `sw.js` is how a device ends up running an offline shell from a build that
         * no longer matches the application, and the failure is invisible: the page loads, it
         * is simply the wrong page. On a Field Manager's phone that means a capture surface
         * that disagrees with the server about what a match package contains.
         */
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          // The worker has no business loading anything but its own origin's scripts.
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
