import { goalPlaceEnvironment } from '@/lib/environment';

const COPY = {
  demo: 'GoalPlace256 Preview Environment — illustrative sports and financial data.',
  beta: 'GoalPlace256 Beta — test environment. No real payments.',
} as const;

export function EnvironmentBanner() {
  const environment = goalPlaceEnvironment();
  const message = environment === 'demo' || environment === 'beta' ? COPY[environment] : null;
  if (!message) return null;

  return (
    <div className="border-b border-border bg-surface-1 px-3 py-2 text-center text-xs text-muted">
      {message}
    </div>
  );
}
