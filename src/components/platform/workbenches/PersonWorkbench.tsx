import { WorkbenchShell } from './WorkbenchShell';

export function PersonWorkbench({ id, tab, command }: { id: string; tab?: string; command?: string }) {
  return <WorkbenchShell kind="person" entityId={id} basePath={`/admin/network/people/${encodeURIComponent(id)}`} initialTab={tab} initialCommand={command} />;
}
