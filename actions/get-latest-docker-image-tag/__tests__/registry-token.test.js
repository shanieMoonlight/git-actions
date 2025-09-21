import { describe, it, expect, vi, afterEach } from 'vitest';

//########################//

afterEach(() => {
    // clear module cache and restore mocks between tests
    vi.resetModules();
    vi.restoreAllMocks();
});

//------------------------//

describe('fetchRegistryToken', () => {
    it('returns token when anonymous call succeeds', async () => {
        const fakeRes = { json: { token: 'anon-token' } };
        const mockFetchJson = vi.fn().mockResolvedValue(fakeRes);

        // doMock is not hoisted; safe to use per-test
        vi.doMock('../http.js', () => ({ fetchJson: mockFetchJson }));

        const { fetchRegistryToken } = await import('../registry-token.js');
        const token = await fetchRegistryToken('owner/repo', { dockerUsername: '', dockerhubToken: '', logger: console });
        expect(token).toBe('anon-token');
        expect(mockFetchJson).toHaveBeenCalled();
    });

    //------------------------//

    it('returns token when basic auth call succeeds', async () => {
        const fakeRes = { json: { token: 'auth-token' } };
        const mockFetchJson = vi.fn().mockResolvedValue(fakeRes);

        vi.doMock('../http.js', () => ({ fetchJson: mockFetchJson }));

        const { fetchRegistryToken } = await import('../registry-token.js');
        const token = await fetchRegistryToken('owner/repo', { dockerUsername: 'u', dockerhubToken: 't', logger: console });
        expect(token).toBe('auth-token');
        expect(mockFetchJson).toHaveBeenCalled();
    });

    //------------------------//

    it('returns empty string when fetchJson throws', async () => {
        const mockFetchJson = vi.fn().mockRejectedValue(new Error('network'));

        vi.doMock('../http.js', () => ({ fetchJson: mockFetchJson }));

        const { fetchRegistryToken } = await import('../registry-token.js');
        const token = await fetchRegistryToken('owner/repo', { dockerUsername: '', dockerhubToken: '', logger: console });
        expect(token).toBe('');
        expect(mockFetchJson).toHaveBeenCalled();
    });
});

//------------------------//
