'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';

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
