// import { describe, it, expect } from 'vitest';
// import { scoreEntry, pickTagFromApiJson } from '../index.js';

// //#########################//

// describe('scoreEntry and pickTagFromApiJson', () => {
//     // it('scoreEntry: prefers last_updated when present', async () => {
//     //     const { scoreEntry } = await import('../index.js');
//     //     const entry = { name: '20220101_000000', last_updated: '2022-02-02T12:00:00Z' };
//     //     const s = scoreEntry(entry);
//     //     expect(s).toBe(Date.parse('2022-02-02T12:00:00Z'));
//     // });

//     //- - - - - - - - - - - - -//

//     it('scoreEntry: falls back to name timestamp when no last_updated', () => {
//         return import('../index.js').then(({ scoreEntry }) => {
//             const entry = { name: '20220101_000000' };
//             const s = scoreEntry(entry);
//             expect(s).toBe(Date.parse('2022-01-01T00:00:00Z'));
//         });
//     });

//     //- - - - - - - - - - - - -//

//     it('scoreEntry: returns 0 for invalid inputs', () => {
//         return import('../index.js').then(({ scoreEntry }) => {
//             expect(scoreEntry({})).toBe(0);
//             expect(scoreEntry({ name: 'not-a-ts' })).toBe(0);
//         });
//     });

//     //- - - - - - - - - - - - -//

//     it('pickTagFromApiJson: filters out latest and picks newest timestamped tag', () => {
//         return import('../index.js').then(({ pickTagFromApiJson }) => {
//             const apiJson = {
//                 results: [
//                     { name: 'latest', last_updated: '2020-01-01T00:00:00Z' },
//                     { name: '20220101_000000', last_updated: '2022-01-01T00:00:00Z' },
//                     { name: '20230101_000000', last_updated: '2023-01-01T00:00:00Z' }
//                 ]
//             };
//             const tag = pickTagFromApiJson(apiJson);
//             expect(tag).toBe('20230101_000000');
//         });
//     });

//     //- - - - - - - - - - - - -//

//     it('pickTagFromApiJson: when no ts-like names present picks newest by last_updated', () => {
//         return import('../index.js').then(({ pickTagFromApiJson }) => {
//             const apiJson = {
//                 results: [
//                     { name: 'alpha', last_updated: '2021-01-01T00:00:00Z' },
//                     { name: 'beta', last_updated: '2022-06-01T00:00:00Z' }
//                 ]
//             };
//             const tag = pickTagFromApiJson(apiJson);
//             expect(tag).toBe('beta');
//         });
//     });

//     //- - - - - - - - - - - - -//

//     it('pickTagFromApiJson: returns empty string when no results', () => {
//         return import('../index.js').then(({ pickTagFromApiJson }) => {
//             expect(pickTagFromApiJson(null)).toBe('');
//             expect(pickTagFromApiJson({ results: [] })).toBe('');
//         });
//     });
// });
