import { MatchExceptionQueue } from '@/components/league/MatchExceptionQueue';

export const metadata = { title: 'Command' };

/**
 * What needs me today.
 *
 * The one question this surface answers on open. Everything else a League Admin does has its
 * own tab; this is the place where the platform tells them what it could not settle by
 * itself, and on a good matchday it is empty.
 */
export default function LeagueCommandPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-brand">Command</p>
        <h1 className="mt-2 text-2xl font-semibold text-text-strong">Needs attention</h1>
      </header>
      {/*
        Rows are loaded by the page that mounts this in the app; the queue renders whatever it
        is given so the conflict-before-controls ordering is a property of the component rather
        than of one caller.
      */}
      <MatchExceptionQueue rows={[]} />
    </div>
  );
}
