import { DiscoverHub } from '@/components/discover/DiscoverHub';
import { PreviewDataNotice } from '@/components/ui/PreviewDataNotice';
import { getPublicDiscoveryData } from '@/server/publicCatalogue';

/**
 * Server-rendered, and cached for a minute.
 *
 * `/discover` was the one public surface with no server data at all: every visitor issued
 * their own reads across five collections and composed the feed in the browser, so Firestore
 * spend scaled with traffic times catalogue size on the most linked-to page in the product.
 *
 * 60 seconds is chosen against what the page shows. Its slowest-moving content is leagues,
 * clubs and athletes; its fastest is a live match score, and a score that is up to a minute
 * stale on a discovery feed is not a correctness problem — the match page itself is live. A
 * shorter window would spend most of its reads on visitors who cannot tell the difference.
 */
export const revalidate = 60;

export default async function DiscoverPage() {
  const { data: initialData, source } = await getPublicDiscoveryData();
  return (
    <>
      <PreviewDataNotice source={source} className="mx-auto mt-3 w-[min(100%-2rem,72rem)]" />
      <DiscoverHub initialData={initialData} />
    </>
  );
}
