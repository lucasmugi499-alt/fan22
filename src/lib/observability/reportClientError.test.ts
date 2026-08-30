import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * There was no client error tracking at all.
 *
 * The server side is thoroughly instrumented — `adminAuditEvents`, `securityEvents`, a
 * submission event log, operational exceptions — and the browser half had no counterpart, so a
 * page that threw for a real user was invisible unless they said something.
 *
 * The rules a crash reporter has to follow are unusual, and all three are load-bearing: it must
 * not throw (a reporter that fails inside an error handler turns one visible failure into two,
 * and the second has nowhere to go), it must not block, and it must not scrape context — a
 * crash reporter that collects the page's state is one that exfiltrates it.
 */

const ORIGINAL_ENV = process.env.NODE_ENV;

function loadModule() {
  // Re-imported per test: the module holds an `installed` flag so the global handlers are
  // registered once, and a shared instance would leak that between cases.
  vi.resetModules();
  return import('./reportClientError');
}

beforeEach(() => {
  vi.unstubAllGlobals();
  // The reporter is a no-op in development, so every assertion here needs production.
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv('NODE_ENV', ORIGINAL_ENV ?? 'test');
});

function stubBrowser(fetchImpl: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, EventListener>();
  vi.stubGlobal('window', {
    location: { pathname: '/leagues/league_1', search: '?token=secret&tab=table' },
    addEventListener: (type: string, fn: EventListener) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  });
  vi.stubGlobal('fetch', fetchImpl);
  return listeners;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe('reporting one error', () => {
  it('posts to the reporting endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    reportClientError({ error: new Error('boom') });

    expect(fetchMock).toHaveBeenCalledWith('/api/client-errors', expect.objectContaining({
      method: 'POST',
    }));
    expect(sentBody(fetchMock).message).toBe('boom');
  });

  it('uses keepalive, so the report survives the navigation a crash causes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    reportClientError({ error: new Error('boom') });

    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('sends the path but never the query string', async () => {
    // `search` carries whatever a page put in the URL — a token, an email, a filter naming a
    // person. A crash reporter is the last place that should be copied into a log.
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    reportClientError({ error: new Error('boom') });

    const body = sentBody(fetchMock);
    expect(body.path).toBe('/leagues/league_1');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('carries the requestId, which is the join to the server record', async () => {
    // requireAuthenticatedMutation mints this per mutation and writes it into the audit
    // entry, so the browser failure and the cause become one query.
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    reportClientError({ error: new Error('boom'), requestId: 'req_123', digest: 'dig_456' });

    expect(sentBody(fetchMock)).toMatchObject({ requestId: 'req_123', digest: 'dig_456' });
  });

  it('truncates a runaway stack rather than billing for the log volume', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    const error = new Error('deep');
    error.stack = 'x'.repeat(50_000);
    reportClientError({ error });

    expect(sentBody(fetchMock).stack.length).toBeLessThanOrEqual(4_000);
  });

  it('handles a thrown non-Error without inventing a stack', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    reportClientError({ error: 'a bare string' });

    const body = sentBody(fetchMock);
    expect(body.message).toBe('a bare string');
    // Absent, not present-and-undefined: JSON.stringify drops the key, so the server's
    // optional-field schema never sees it at all.
    expect('stack' in body).toBe(false);
  });
});

describe('the reporter never becomes the problem', () => {
  it('does not throw when the network rejects', async () => {
    // The failure it is reporting may BE the network. A rejection here would surface as a
    // second unhandled rejection, which the global handler would then try to report.
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    expect(() => reportClientError({ error: new Error('boom') })).not.toThrow();
  });

  it('does not throw when fetch itself is missing', async () => {
    const fetchMock = vi.fn(() => { throw new TypeError('fetch is not a function'); });
    stubBrowser(fetchMock as unknown as ReturnType<typeof vi.fn>);
    const { reportClientError } = await loadModule();

    expect(() => reportClientError({ error: new Error('boom') })).not.toThrow();
  });

  it('stays silent in development, where the stack is already in the console', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = vi.fn();
    stubBrowser(fetchMock);
    const { reportClientError } = await loadModule();

    reportClientError({ error: new Error('boom') });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('what no React boundary sees', () => {
  it('reports an unhandled promise rejection', async () => {
    // A fetch that rejects in an event handler is not a render failure, so no error boundary
    // catches it — and between this and window errors that is most of what actually goes
    // wrong in a browser.
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const listeners = stubBrowser(fetchMock);
    const { installGlobalErrorReporting } = await loadModule();
    installGlobalErrorReporting();

    listeners.get('unhandledrejection')?.({
      reason: new Error('rejected'),
    } as unknown as Event);

    expect(sentBody(fetchMock)).toMatchObject({
      message: 'rejected', kind: 'unhandled_rejection',
    });
  });

  it('reports a window error raised outside the render tree', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const listeners = stubBrowser(fetchMock);
    const { installGlobalErrorReporting } = await loadModule();
    installGlobalErrorReporting();

    listeners.get('error')?.({ error: new Error('script blew up') } as unknown as Event);

    expect(sentBody(fetchMock)).toMatchObject({
      message: 'script blew up', kind: 'window_error',
    });
  });

  it('installs once, however many times it is mounted', async () => {
    // React may mount the host component more than once. Two sets of handlers would report
    // every failure twice.
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const listeners = stubBrowser(fetchMock);
    const { installGlobalErrorReporting } = await loadModule();

    installGlobalErrorReporting();
    installGlobalErrorReporting();
    listeners.get('error')?.({ error: new Error('once') } as unknown as Event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('removes its handlers when unmounted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const listeners = stubBrowser(fetchMock);
    const { installGlobalErrorReporting } = await loadModule();

    installGlobalErrorReporting()();

    expect(listeners.has('error')).toBe(false);
    expect(listeners.has('unhandledrejection')).toBe(false);
  });
});
