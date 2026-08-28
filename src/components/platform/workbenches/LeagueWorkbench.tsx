import { WorkbenchShell } from './WorkbenchShell';

export function LeagueWorkbench({ id, tab, command }: { id: string; tab?: string; command?: string }) {
  return <WorkbenchShell kind="league" entityId={id} basePath={`/admin/network/leagues/${encodeURIComponent(id)}`} initialTab={tab} initialCommand={command} />;
}
