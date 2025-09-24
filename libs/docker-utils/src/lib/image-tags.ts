import { DockerCredentials } from './docker-credentials.js';
import { fetchJson, fetchText } from './http.js';
import { ILogger } from './i-logger.js';
import { DockerTag, DockerTagsResponse } from './image-tag-responses.js';

//#########################//

export function extractTagTimestamp(entry: any): number {

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

export function selectLatestTagFromApiJson(apiJson: DockerTagsResponse): string {

    if (!apiJson || !Array.isArray(apiJson.results))
        return '';

    // Normalize and filter results: must have a name and not be 'latest'
    const candidates = apiJson.results
        .filter((r: DockerTag) => r && typeof r.name === 'string')
        .filter((r: DockerTag) => r.name.toLowerCase() !== 'latest');

    if (candidates.length === 0)
        return '';

    // Prefer timestamp-like names if present among candidates
    const tsLike = candidates.filter((r: DockerTag) => /\d{8}_\d{6}/.test(r.name));
    const pool = tsLike.length > 0 ? tsLike : candidates;

    // Sort by computed score (older -> newer) and pick the newest
    pool.sort((a: DockerTag, b: DockerTag) => extractTagTimestamp(a) - extractTagTimestamp(b));
    const chosen = pool[pool.length - 1];

    return chosen && chosen.name ? chosen.name : '';
}

//- - - - - - - - - - - - -//

export async function fetchRepoTags(
    repo: string,
    dockerCredentials: DockerCredentials = {},
    { pageSize = 100, maxPages = 5 } = {},
    logger: ILogger = console
): Promise<DockerTagsResponse> {

    const { dockerUsername, dockerhubToken } = dockerCredentials

    const base = `https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=${pageSize}`;
    const combined: DockerTag[] = [];
    let url = base;
    let page = 0;

    try {
        while (url && page < maxPages) {
            page += 1;
            const headers: Record<string, string> = {};
            if (dockerUsername && dockerhubToken) {
                const auth = Buffer.from(`${dockerUsername}:${dockerhubToken}`).toString('base64');
                headers.Authorization = `Basic ${auth}`;
            }

            const res = await fetchJson(url, { headers });
            if (!res || typeof res.status !== 'number')
                throw new Error('Empty response from Docker Hub tags API');

            if (res.status < 200 || res.status >= 300)
                throw new Error(`Docker Hub tags API returned status ${res.status}`);

            const bodyJson: DockerTagsResponse | null = res.json || null;
            if (!bodyJson || !Array.isArray(bodyJson.results))
                break;

            combined.push(...bodyJson.results);

            // follow pagination
            url = bodyJson.next || '';
        }

        return { count: combined.length, results: combined, next: url };  // Adjust to match interface

    } catch (err: any) {
        logger.error('Failed to fetch tags from Docker Hub', err.message || err);
        throw err;
    }
}

//- - - - - - - - - - - - -//

export async function fetchManifestDigest(repo: string, tag: string, authToken: string): Promise<string> {

    if (!authToken)
        return '';

    try {
        const manifestUrl = `https://registry-1.docker.io/v2/${repo}/manifests/${tag}`;
        const res = await fetchText(manifestUrl, {
            method: 'HEAD',
            headers: {
                Authorization: `Bearer ${authToken}`,
                Accept: 'application/vnd.docker.distribution.manifest.v2+json'
            }
        });

        let digest = '';
        const hdrs = res.headers || {};
        for (const [name, value] of Object.entries(hdrs)) {
            if (name && typeof name === 'string' && name.toLowerCase() === 'docker-content-digest') {
                digest = Array.isArray(value) ? value[0] || '' : value || '';
                break;
            }
        }

        if (!digest && res.headers && res.headers['docker-content-digest']) {
            const hdr = res.headers['docker-content-digest'];
            digest = Array.isArray(hdr) ? hdr[0] || '' : hdr || '';
        }

        return digest || '';
    } catch (e) {
        return '';
    }
}

//#########################//