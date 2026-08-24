import type { MetadataRoute } from 'next';

/**
 * Web app manifest, so Match Ops can be installed to a Field Manager's homescreen.
 *
 * A `manifest.ts` in the app directory rather than a static file in `public/`: this is the
 * framework's own convention in this version, and it means the manifest is typed and cannot
 * drift from the metadata in the root layout.
 *
 * `display: 'standalone'` matters more here than it looks. A Field Manager running a match in
 * a browser tab loses the clock to a backgrounded Safari, gets the address bar eating 60px of
 * a 390px screen, and has one swipe between them and navigating away mid-match. Installed,
 * the capture surface behaves like an app on a phone that is already struggling.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GoalPlace256',
    short_name: 'GoalPlace',
    description: 'Verified grassroots sport in Uganda: live match capture, standings and career records.',
    // The match ops surface is the reason to install this, but the link a Field Manager is
    // sent carries its own one-time secret and cannot be a start_url. Home is the honest
    // landing place; the match link takes them the rest of the way.
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#05070A',
    theme_color: '#05070A',
    icons: [
      { src: '/brand/goalplace-icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/goalplace-icon-original.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
