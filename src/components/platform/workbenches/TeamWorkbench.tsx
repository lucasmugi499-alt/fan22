import { WorkbenchShell } from './WorkbenchShell';

export function TeamWorkbench({ id, tab, command }: { id: string; tab?: string; command?: string }) {
  return <WorkbenchShell kind="team" entityId={id} basePath={`/admin/network/teams/${encodeURIComponent(id)}`} initialTab={tab} initialCommand={command} />;
}
