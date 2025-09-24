import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractTagTimestamp, selectLatestTagFromApiJson, fetchRepoTags, fetchManifestDigest } from './image-tags.js';

vi.mock('./http.js', () => ({
  fetchJson: vi.fn(),
  fetchText: vi.fn(),
}));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('extractTagTimestamp', () => {
  it('returns timestamp from valid last_updated', () => {
    const entry = { name: 'some-tag', last_updated: '2023-01-01T12:00:00Z' } as any;
    const result = extractTagTimestamp(entry);
    expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
  });

  it('falls back to parsing timestamp-like name when last_updated is invalid', () => {
    const entry = { name: '20230101_120000', last_updated: 'invalid-date' } as any;
    const result = extractTagTimestamp(entry);
    expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
  });

  it('returns 0 for non-timestamp-like name when last_updated is missing', () => {
    const entry = { name: 'latest' } as any;
    const result = extractTagTimestamp(entry);
    expect(result).toBe(0);
  });

  it('returns 0 for invalid timestamp-like name', () => {
    const entry = { name: '20231301_250000' } as any; // Invalid date
    const result = extractTagTimestamp(entry);
    expect(result).toBe(0);
  });

  it('returns 0 for entry without name or last_updated', () => {
    const entry = {} as any;
    const result = extractTagTimestamp(entry);
    expect(result).toBe(0);
  });
});

describe('selectLatestTagFromApiJson', () => {
  it('returns empty string for invalid apiJson', () => {
    const result = selectLatestTagFromApiJson(null as any);
    expect(result).toBe('');
  });

  it('returns empty string when no results', () => {
    const apiJson = { results: [], count: 0 } as any;
    const result = selectLatestTagFromApiJson(apiJson);
    expect(result).toBe('');
  });

  it('filters out latest and picks the newest timestamp-like tag', () => {
    const apiJson = {
      results: [
        { name: 'latest', last_updated: '2023-01-01T00:00:00Z' },
        { name: '20230101_120000', last_updated: '2023-01-01T10:00:00Z' },
        { name: '20230101_130000', last_updated: '2023-01-01T11:00:00Z' }
      ],
      count: 3
    } as any;
    const result = selectLatestTagFromApiJson(apiJson);
    expect(result).toBe('20230101_130000');
  });

  it('falls back to non-timestamp tags when no timestamp-like names present', () => {
    const apiJson = {
      results: [
        { name: 'latest', last_updated: '2023-01-01T00:00:00Z' },
        { name: 'v1.0.0', last_updated: '2023-01-01T12:00:00Z' },
        { name: 'v1.1.0', last_updated: '2023-01-01T13:00:00Z' }
      ],
      count: 3
    } as any;
    const result = selectLatestTagFromApiJson(apiJson);
    expect(result).toBe('v1.1.0');
  });

  it('returns empty string when all candidates are filtered out', () => {
    const apiJson = {
      results: [
        { name: 'latest' },
        { name: null }
      ],
      count: 2
    } as any;
    const result = selectLatestTagFromApiJson(apiJson);
    expect(result).toBe('');
  });
});

describe('fetchRepoTags', () => {
  it('fetches tags successfully', async () => {
    const mockFetchJson = vi.fn().mockResolvedValue({
      status: 200,
      json: { results: [{ name: 'tag1' }, { name: 'tag2' }], next: null }
    });

    vi.mocked(await import('./http.js')).fetchJson = mockFetchJson;

    const result = await fetchRepoTags('owner/repo');
    expect(result.results).toEqual([{ name: 'tag1' }, { name: 'tag2' }]);
    expect(mockFetchJson).toHaveBeenCalled();
  });

  it('handles pagination', async () => {
    const mockFetchJson = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: { results: [{ name: 'tag1' }], next: 'next-url' }
      })
      .mockResolvedValueOnce({
        status: 200,
        json: { results: [{ name: 'tag2' }], next: null }
      });

    vi.mocked(await import('./http.js')).fetchJson = mockFetchJson;

    const result = await fetchRepoTags('owner/repo');
    expect(result.results).toEqual([{ name: 'tag1' }, { name: 'tag2' }]);
  });

  it('throws on API error', async () => {
    const mockFetchJson = vi.fn().mockResolvedValue({
      status: 404,
      json: null
    });

    vi.mocked(await import('./http.js')).fetchJson = mockFetchJson;

    await expect(fetchRepoTags('owner/repo')).rejects.toThrow('Docker Hub tags API returned status 404');
  });
});

describe('fetchManifestDigest', () => {
  it('returns digest when auth token provided', async () => {
    const mockFetchText = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'docker-content-digest': ['sha256:abc123'] }
    });

    vi.mocked(await import('./http.js')).fetchText = mockFetchText;

    const result = await fetchManifestDigest('owner/repo', 'tag', 'token');
    expect(result).toBe('sha256:abc123');
  });

  it('returns empty string when no auth token', async () => {
    const result = await fetchManifestDigest('owner/repo', 'tag', '');
    expect(result).toBe('');
  });

  it('returns empty string on error', async () => {
    const mockFetchText = vi.fn().mockRejectedValue(new Error('network'));

    vi.mocked(await import('./http.js')).fetchText = mockFetchText;

    const result = await fetchManifestDigest('owner/repo', 'tag', 'token');
    expect(result).toBe('');
  });
});