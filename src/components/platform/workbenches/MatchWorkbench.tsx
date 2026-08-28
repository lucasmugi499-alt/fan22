import { WorkbenchShell } from './WorkbenchShell';

export function MatchWorkbench({ id, tab, command }: { id: string; tab?: string; command?: string }) {
  return <WorkbenchShell kind="match" entityId={id} basePath={`/admin/integrity/matches/${encodeURIComponent(id)}`} initialTab={tab} initialCommand={command} />;
}
