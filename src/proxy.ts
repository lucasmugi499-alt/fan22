import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Constant-time, like every other secret comparison in this codebase.
 *
 * This was `supplied === expected`, which is the one string comparison in the repo that
 * short-circuits on the first differing byte while `server/api/security.ts` uses
 * `timingSafeEqual` for the same class of value. Remotely exploiting the difference over a
 * network is impractical; that is not the point. A secret compared two different ways in two
 * places is a codebase that has no rule about it, and the next person copies whichever one
 * they happen to read.
 *
 * `node:crypto` is available here: Next 16 runs Proxy on the Node.js runtime, and the
 * `runtime` segment option is not settable in a Proxy file, so it cannot be moved to Edge
 * without this import failing loudly at build.
 *
 * The length check before `timingSafeEqual` is required — it throws on mismatched lengths —
 * and leaks only the length of the supplied value, which the attacker already knows.
 */
function validSecret(supplied: string | null, expected: string | undefined) {
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAsset(pathname: string) {
  return pathname.startsWith('/_next/') || /\.[a-zA-Z0-9]{2,8}$/.test(pathname);
}

export function proxy(request: NextRequest) {
  const requiresGateway = process.env.GOALPLACE_REQUIRE_GATEWAY_SECRET === 'true';
  if (requiresGateway) {
    const gatewaySecret = request.headers.get('x-goalplace-origin-secret');
    const staffSecret = request.headers.get('x-goalplace-staff-preview-secret');
    if (
      !validSecret(gatewaySecret, process.env.GOALPLACE_EDGE_ORIGIN_SECRET) &&
      !validSecret(staffSecret, process.env.GOALPLACE_STAFF_PREVIEW_SECRET)
    ) {
      return new NextResponse('Access denied.', {
        status: 403,
        headers: { 'cache-control': 'no-store' },
      });
    }
  }

  if (process.env.GOALPLACE_ENVIRONMENT === 'maintenance') {
    const { pathname } = request.nextUrl;
    if (pathname === '/maintenance' || isAsset(pathname)) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { error: 'GoalPlace256 is temporarily in maintenance.' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }
    return NextResponse.rewrite(new URL('/maintenance', request.url));
  }

  return NextResponse.next();
}
