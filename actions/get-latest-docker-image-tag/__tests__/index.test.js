import { describe, it, expect } from 'vitest';
import { scoreEntry, pickTagFromApiJson } from '../index.js';

describe('scoreEntry', () => {
    it('returns timestamp from valid last_updated', () => {
        const entry = { name: 'some-tag', last_updated: '2023-01-01T12:00:00Z' };
        const result = scoreEntry(entry);
        expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
    });

    it('falls back to parsing timestamp-like name when last_updated is invalid', () => {
        const entry = { name: '20230101_120000', last_updated: 'invalid-date' };
        const result = scoreEntry(entry);
        expect(result).toBe(Date.parse('2023-01-01T12:00:00Z'));
    });

    it('returns 0 for non-timestamp-like name when last_updated is missing', () => {
        const entry = { name: 'latest' };
        const result = scoreEntry(entry);
        expect(result).toBe(0);
    });

    it('returns 0 for invalid timestamp-like name', () => {
        const entry = { name: '20231301_250000' }; // Invalid date
        const result = scoreEntry(entry);
        expect(result).toBe(0);
    });

    it('returns 0 for entry without name or last_updated', () => {
        const entry = {};
        const result = scoreEntry(entry);
        expect(result).toBe(0);
    });
});

describe('pickTagFromApiJson', () => {
    it('returns empty string for invalid apiJson', () => {
        const result = pickTagFromApiJson(null);
        expect(result).toBe('');
    });

    it('returns empty string when no results', () => {
        const apiJson = { results: [] };
        const result = pickTagFromApiJson(apiJson);
        expect(result).toBe('');
    });

    it('filters out latest and picks the newest timestamp-like tag', () => {
        const apiJson = {
            results: [
                { name: 'latest', last_updated: '2023-01-01T00:00:00Z' },
                { name: '20230101_120000', last_updated: '2023-01-01T10:00:00Z' },
                { name: '20230101_130000', last_updated: '2023-01-01T11:00:00Z' }
            ]
        };
        const result = pickTagFromApiJson(apiJson);
        expect(result).toBe('20230101_130000');
    });

    it('falls back to non-timestamp tags when no timestamp-like names present', () => {
        const apiJson = {
            results: [
                { name: 'latest', last_updated: '2023-01-01T00:00:00Z' },
                { name: 'v1.0.0', last_updated: '2023-01-01T12:00:00Z' },
                { name: 'v1.1.0', last_updated: '2023-01-01T13:00:00Z' }
            ]
        };
        const result = pickTagFromApiJson(apiJson);
        expect(result).toBe('v1.1.0');
    });

    it('returns empty string when all candidates are filtered out', () => {
        const apiJson = {
            results: [
                { name: 'latest' },
                { name: null }
            ]
        };
        const result = pickTagFromApiJson(apiJson);
        expect(result).toBe('');
    });
});