export const metadata = { title: 'Offline' };

/**
 * The page a Field Manager sees when the radio is off and they land somewhere uncached.
 *
 * Deliberately reassuring about the thing they will actually be worried about: whether the
 * match they are recording has been lost. It has not. Events are written to the device before
 * they are sent, and they replay when signal returns.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-text-strong">You are offline</h1>
      <p className="text-sm text-muted">
        This page needs a connection. If you are in the middle of a match, keep going: every
        event you record is saved on this phone and sent automatically when signal comes back.
      </p>
      <p className="text-xs text-muted">Nothing you have captured has been lost.</p>
    </main>
  );
}
