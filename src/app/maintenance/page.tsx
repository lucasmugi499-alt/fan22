import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Maintenance | GoalPlace256',
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <section className="w-full max-w-lg text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">GoalPlace256</p>
        <h1 className="mt-4 text-3xl font-semibold text-text-strong md:text-4xl">
          We are updating the platform
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          GoalPlace256 is temporarily in maintenance while the active environment is switched or verified.
          Please check back shortly.
        </p>
      </section>
    </main>
  );
}
