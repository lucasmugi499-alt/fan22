/**
 * Re-mounts on every route change, giving each page a single fluid entrance (fade + rise).
 * This is the app's page transition; anything heavier (scroll reveals inside dashboards)
 * is deliberately out. Reduced-motion users get an instant swap via the global media rule.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
