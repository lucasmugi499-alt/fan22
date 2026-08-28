import { WorkbenchShell } from './WorkbenchShell';

export function AthleteWorkbench({ id, tab, command }: { id: string; tab?: string; command?: string }) {
  return <WorkbenchShell kind="athlete" entityId={id} basePath={`/admin/network/athletes/${encodeURIComponent(id)}`} initialTab={tab} initialCommand={command} />;
}
