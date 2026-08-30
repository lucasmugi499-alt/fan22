import type { Metadata } from 'next';
import { MyMatches } from '@/components/athlete/MyMatches';

export const metadata: Metadata = { title: 'My matches · My Career' };

export default function Page() {
  return <MyMatches />;
}
