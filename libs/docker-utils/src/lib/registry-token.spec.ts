import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRegistryToken } from './registry-token.js';

vi.mock('./http.js', () => ({
  fetchJson: vi.fn(),
}));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('fetchRegistryToken', () => {
  it('returns token when anonymous call succeeds', async () => {
    const fakeRes = { json: { token: 'anon-token' } };
    const mockFetchJson = vi.fn().mockResolvedValue(fakeRes);

    vi.mocked(await import('./http.js')).fetchJson = mockFetchJson;

    const token = await fetchRegistryToken('owner/repo', { dockerUsername: '', dockerhubToken: '' }, console);
    expect(token).toBe('anon-token');
    expect(mockFetchJson).toHaveBeenCalled();
  });

  it('returns token when basic auth call succeeds', async () => {
    const fakeRes = { json: { token: 'auth-token' } };
    const mockFetchJson = vi.fn().mockResolvedValue(fakeRes);

    vi.mocked(await import('./http.js')).fetchJson = mockFetchJson;

    const token = await fetchRegistryToken('owner/repo', { dockerUsername: 'u', dockerhubToken: 't' }, console);
    expect(token).toBe('auth-token');
    expect(mockFetchJson).toHaveBeenCalled();
  });

  it('returns empty string when fetchJson throws', async () => {
    const mockFetchJson = vi.fn().mockRejectedValue(new Error('network'));

    vi.mocked(await import('./http.js')).fetchJson = mockFetchJson;

    const token = await fetchRegistryToken('owner/repo', { dockerUsername: '', dockerhubToken: '' }, console);
    expect(token).toBe('');
  });
});