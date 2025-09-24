import { DockerCredentials } from './docker-credentials.js';
import { fetchJson } from './http.js';

//#########################//

export function scoreEntry(entry: any): number {

    const name = (entry.name || '').trim();
    // Try last_updated first and return immediately if valid
    if (entry.last_updated) {
        const parsed = Date.parse(entry.last_updated);
        if (!Number.isNaN(parsed))
            return parsed;
    }

    // Otherwise try to parse timestamp-like name (early-return when not matching)
    const m = name.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
    if (!m)
        return 0;

    // Build ISO string YYYY-MM-DDTHH:MM:SSZ
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
    const p = Date.parse(iso);
    if (!Number.isNaN(p))
        return p;

    return 0;
}

//- - - - - - - - - - - - -//

export function pickTagFromApiJson(apiJson: any): string {

    if (!apiJson || !Array.isArray(apiJson.results))
        return '';

    // Normalize and filter results: must have a name and not be 'latest'
    const candidates = apiJson.results
        .filter((r: any) => r && typeof r.name === 'string')
        .filter((r: any) => r.name.toLowerCase() !== 'latest');

    if (candidates.length === 0)
        return '';

    // Prefer timestamp-like names if present among candidates
    const tsLike = candidates.filter((r: any) => /\d{8}_\d{6}/.test(r.name));
    const pool = tsLike.length > 0 ? tsLike : candidates;

    // Sort by computed score (older -> newer) and pick the newest
    pool.sort((a: any, b: any) => scoreEntry(a) - scoreEntry(b));
    const chosen = pool[pool.length - 1];

    return chosen && chosen.name ? chosen.name : '';
}

//- - - - - - - - - - - - -//

export async function fetchRepoTags(
    repo: string,
    dockerCredentials: DockerCredentials = {},
    { pageSize = 100, maxPages = 5, logger = console } = {}
): Promise<{ results: any[] }> {

    const { dockerUsername, dockerToken } = dockerCredentials

    const base = `https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=${pageSize}`;
    const combined: any[] = [];
    let url = base;
    let page = 0;

    try {
        while (url && page < maxPages) {
            page += 1;
            const headers: Record<string, string> = {};
            if (dockerUsername && dockerToken) {
                const auth = Buffer.from(`${dockerUsername}:${dockerToken}`).toString('base64');
                headers.Authorization = `Basic ${auth}`;
            }

            const res = await fetchJson(url, { headers });
            if (!res || typeof res.status !== 'number')
                throw new Error('Empty response from Docker Hub tags API');

            if (res.status < 200 || res.status >= 300)
                throw new Error(`Docker Hub tags API returned status ${res.status}`);

            const bodyJson = res.json || null;
            if (!bodyJson || !Array.isArray(bodyJson.results))
                break;

            combined.push(...bodyJson.results);

            // follow pagination
            url = (bodyJson && typeof bodyJson.next === 'string')
                ? bodyJson.next
                : null;
        }

        return { results: combined };

    } catch (err: any) {
        logger.error && logger.error('Failed to fetch tags from Docker Hub', err.message || err);
        throw err;
    }
}

//#########################//