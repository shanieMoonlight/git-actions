import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeHeaders, requestWithTimeout, fetchJson, fetchText } from './http.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('normalizeHeaders', () => {
  it('converts array style headers to map with lowercase keys', () => {
    const raw = [{ name: 'X-Header', value: 'v1' }, { name: 'X-Header', value: 'v2' }, { name: 'Other', value: 'o' }];
    const out = normalizeHeaders(raw);
    expect(out['x-header']).toEqual(['v1', 'v2']);
    expect(out['other']).toEqual(['o']);
  });

  it('keeps object style headers intact (lowercased keys)', () => {
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

    vi.mocked(await import('undici')).request = mockRequest;

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

    vi.mocked(await import('undici')).request = mockRequest;

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

    vi.mocked(await import('undici')).request = mockRequest;

    const res = await fetchJson('https://example');
    expect(res.status).toBe(200);
    expect(res.json).toBeNull();
  });

  it('fetchText returns text response', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: [{ name: 'content-type', value: 'text/plain' }],
      body: { text: async () => 'hello world' }
    });

    vi.mocked(await import('undici')).request = mockRequest;

    const res = await fetchText('https://example');
    expect(res.status).toBe(200);
    expect(res.body).toBe('hello world');
  });
});