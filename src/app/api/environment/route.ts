import { publicEnvironment } from '@/lib/environment';

export const runtime = 'nodejs';

export function GET() {
  return Response.json(publicEnvironment(), {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
