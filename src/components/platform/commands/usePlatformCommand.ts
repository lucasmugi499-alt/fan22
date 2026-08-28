'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { platformCommand, resolvePlatformCommandEndpoint } from '@/lib/platform/commandRegistry';

/**
 * The client half of the command layer.
 *
 * Nothing here decides anything. It carries a typed body to a server route that runs the
 * capability check, the reason check and the state-machine check, and it reports back what
 * the server said. The console is a keyboard, not an authority — which is why every failure
 * path below surfaces the server's own message verbatim rather than a generic "that didn't
 * work": the server's refusals name the blocking dependency or the missing capability, and
 * that is the sentence the operator actually needs.
 */
export type CommandState = {
  running: boolean;
  error: string | null;
  success: string | null;
};

export function usePlatformCommand(endpoint: string) {
  const { currentUser, isDemoMode } = useAuth();
  const [state, setState] = useState<CommandState>({ running: false, error: null, success: null });

  const reset = useCallback(() => setState({ running: false, error: null, success: null }), []);

  const run = useCallback(async (body: Record<string, unknown>, successMessage: string) => {
    // Demo personas hold a stand-in user with no token. Saying so plainly beats letting a
    // TypeError surface as the command's error text, and beats pretending the write landed.
    if (isDemoMode) {
      setState({
        running: false,
        error: 'Demo sessions cannot run platform commands. These write to the real network and need a signed-in platform operator.',
        success: null,
      });
      return false;
    }
    if (!currentUser || typeof currentUser.getIdToken !== 'function') {
      setState({ running: false, error: 'Sign in again to run platform commands.', success: null });
      return false;
    }

    setState({ running: true, error: null, success: null });
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'The command was refused.');
      setState({ running: false, error: null, success: successMessage });
      return true;
    } catch (cause) {
      setState({
        running: false,
        error: cause instanceof Error ? cause.message : 'The command was refused.',
        success: null,
      });
      return false;
    }
  }, [currentUser, endpoint, isDemoMode]);

  return { ...state, run, reset };
}

/**
 * A command hook for surfaces that do not know which command they will run until the
 * operator picks one.
 *
 * The Desk is the reason this exists. A case card offers whichever actions its kind
 * declares, so the endpoint is only known at the moment the operator chooses, and binding
 * one endpoint at hook-construction time forced the Desk to navigate to the entity page and
 * run the command there instead. That round trip is exactly what the Desk exists to remove.
 *
 * Authority is unchanged: this still only carries a body to the endpoint the registry names,
 * and the route still runs every check.
 */
export function useRegistryCommand() {
  const { currentUser, isDemoMode } = useAuth();
  const [state, setState] = useState<CommandState>({ running: false, error: null, success: null });

  const reset = useCallback(() => setState({ running: false, error: null, success: null }), []);

  const run = useCallback(async (
    commandId: string,
    body: Record<string, unknown>,
    successMessage: string,
    pathParams: Record<string, string | undefined> = {},
  ) => {
    const command = platformCommand(commandId);
    if (!command) {
      setState({ running: false, error: `Unknown command ${commandId}.`, success: null });
      return false;
    }
    const endpoint = resolvePlatformCommandEndpoint(command, pathParams);
    if (!endpoint) {
      setState({ running: false, error: `${command.label} needs a target record before it can run.`, success: null });
      return false;
    }
    if (isDemoMode) {
      setState({
        running: false,
        error: 'Demo sessions cannot run platform commands. These write to the real network and need a signed-in platform operator.',
        success: null,
      });
      return false;
    }
    if (!currentUser || typeof currentUser.getIdToken !== 'function') {
      setState({ running: false, error: 'Sign in again to run platform commands.', success: null });
      return false;
    }

    setState({ running: true, error: null, success: null });
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(endpoint, {
        method: command.method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'The command was refused.');
      setState({ running: false, error: null, success: successMessage });
      return true;
    } catch (cause) {
      setState({
        running: false,
        error: cause instanceof Error ? cause.message : 'The command was refused.',
        success: null,
      });
      return false;
    }
  }, [currentUser, isDemoMode]);

  return { ...state, run, reset };
}
