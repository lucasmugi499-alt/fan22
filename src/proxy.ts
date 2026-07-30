import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function validSecret(supplied: string | null, expected: string | undefined) {
  return Boolean(expected && supplied && supplied === expected);
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
