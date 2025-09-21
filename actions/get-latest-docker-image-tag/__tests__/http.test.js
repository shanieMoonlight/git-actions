import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('normalizeHeaders', () => {
  it('converts array style headers to map with lowercase keys', async () => {
    const { normalizeHeaders } = await import('../http.js');
    const raw = [{ name: 'X-Header', value: 'v1' }, { name: 'X-Header', value: 'v2' }, { name: 'Other', value: 'o' }];
    const out = normalizeHeaders(raw);
    expect(out['x-header']).toEqual(['v1', 'v2']);
    expect(out['other']).toEqual(['o']);
  });

  it('keeps object style headers intact (lowercased keys)', async () => {
    const { normalizeHeaders } = await import('../http.js');
    const raw = { 'Content-Type': ['application/json'], 'X-Test': ['t'] };
    const out = normalizeHeaders(raw);
    expect(out['content-type']).toEqual(['application/json']);
    expect(out['x-test']).toEqual(['t']);
  });
});

describe('requestWithTimeout & fetchJson', () => {
  it('requestWithTimeout returns status, headers, body', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: [{ name: 'X-OK', value: 'yes' }],
      body: { text: async () => 'hello' }
    });

    vi.doMock('undici', () => ({ request: mockRequest }));
    const { requestWithTimeout } = await import('../http.js');

    const res = await requestWithTimeout('https://example', {}, 1000);
    expect(res.status).toBe(200);
    expect(res.body).toBe('hello');
    expect(res.headers['x-ok']).toEqual(['yes']);
  });

  it('fetchJson parses valid JSON and returns json field', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: [{ name: 'content-type', value: 'application/json' }],
      body: { text: async () => '{"ok":true}' }
    });

    vi.doMock('undici', () => ({ request: mockRequest }));
    const { fetchJson } = await import('../http.js');

    const res = await fetchJson('https://example');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
  });

  it('fetchJson returns json null for invalid JSON', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: [{ name: 'content-type', value: 'application/json' }],
      body: { text: async () => 'not-json' }
    });

    vi.doMock('undici', () => ({ request: mockRequest }));
    const { fetchJson } = await import('../http.js');

    const res = await fetchJson('https://example');
    expect(res.status).toBe(200);
    expect(res.json).toBeNull();
  });
});
