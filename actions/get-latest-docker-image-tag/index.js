import process from 'process';
import * as core from '@actions/core';
import { fetchText, fetchJson } from './http.js';
import { fetchRegistryToken } from './registry-token.js';


//#########################//


/**
 * Action contract
 * Inputs:
 *  - repo: string (required) in the form 'namespace/name' (e.g. shaneyboy/movies-api)
 *  - docker_username: optional string
 *  - dockerhub_token: optional string
 *
 * Output (single JSON string under output 'result'):
 *  { repository, tag, digest, picked_at, ref }
 *
 * Error modes / exit codes:
 *  - 1: fetch-failed (network or API error)
 *  - 2: invalid input (missing/invalid repo)
 *  - 3: no-tag-found
 */

/**
 * Validate inputs and provide useful errors/warnings.
 * Exits process with code 2 on invalid repo.
 */
function validateInputs(repo, dockerUsername, dockerhubToken) {

    if (!repo) {
        core.error('Input `repo` is required (format: namespace/name)');
        process.exit(2);
    }

    // // Basic validation: namespace/name, allow letters, digits, - _ .
    // const repoRe = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
    // if (!repoRe.test(repo)) {
    //     core.error(`Invalid repo format: ${repo}. Expected 'namespace/name'`);
    //     process.exit(2);
    // }

    // If only one of username/token is provided, warn the user
    if ((!!dockerUsername && !dockerhubToken) || (!dockerUsername && !!dockerhubToken)) {
        core.warning('Both docker_username and dockerhub_token should be provided for authenticated requests; proceeding unauthenticated.');
    }
}

//- - - - - - - - - - - - -//

function envOrInput(name) {
    // Prefer @actions/core if available (works when running as an action)
    try {
        const val = core.getInput(name);
        if (val) return val;
    } catch (e) {
        // fall back to env
    }
    const envName = `INPUT_${name.toUpperCase()}`;
    return process.env[envName] || process.env[name.toUpperCase()] || '';
}

//- - - - - - - - - - - - -//

// Helper to parse last_updated or extract timestamp from name like 20230101_123456
export function scoreEntry(entry) {
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

export function pickTagFromApiJson(apiJson) {

    if (!apiJson || !Array.isArray(apiJson.results))
        return '';

    // Normalize and filter results: must have a name and not be 'latest'
    const candidates = apiJson.results
        .filter(r => r && typeof r.name === 'string')
        .filter(r => r.name.toLowerCase() !== 'latest');

    if (candidates.length === 0)
        return '';

    // Prefer timestamp-like names if present among candidates
    const tsLike = candidates.filter(r => /\d{8}_\d{6}/.test(r.name));
    const pool = tsLike.length > 0 ? tsLike : candidates;

    // Sort by computed score (older -> newer) and pick the newest
    pool.sort((a, b) => scoreEntry(a) - scoreEntry(b));
    const chosen = pool[pool.length - 1];

    return chosen && chosen.name ? chosen.name : '';
}

//- - - - - - - - - - - - -//

async function fetchRepoTags(repo, { dockerUsername = '', dockerhubToken = '', pageSize = 100, maxPages = 5, logger = getLogger() } = {}) {
    const base = `https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=${pageSize}`;
    const combined = [];
    let url = base;
    let page = 0;

    try {
        while (url && page < maxPages) {
            page += 1;
            const headers = {};
            if (dockerUsername && dockerhubToken) {
                const auth = Buffer.from(`${dockerUsername}:${dockerhubToken}`).toString('base64');
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

            // follow pagination (use ternary for brevity)
            url = (bodyJson && typeof bodyJson.next === 'string')
                ? bodyJson.next
                : null;

        }

        return { results: combined }

    } catch (err) {
        logger.error('Failed to fetch tags from Docker Hub', err.message || err);
        throw err;
    }
}

//- - - - - - - - - - - - -//

// Fetch manifest digest (Docker-Content-Digest) via HEAD on manifest endpoint
async function fetchManifestDigest(repo, tag, token, { logger = getLogger() } = {}) {
    
    if (!token) 
        return '';

    try {
        const manifestUrl = `https://registry-1.docker.io/v2/${repo}/manifests/${tag}`;
        const res = await fetchText(manifestUrl, {
            method: 'HEAD',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.docker.distribution.manifest.v2+json'
            }
        });
        // find Docker-Content-Digest header; undici can expose headers as array or map
        let digest = '';
        const hdrs = res.headers || [];
        for (const h of hdrs) {
            if (h && h.name && typeof h.name === 'string' && h.name.toLowerCase() === 'docker-content-digest') {
                digest = h.value || h.values?.[0] || '';
                break;
            }
        }
        if (!digest && res.headers && res.headers['docker-content-digest']) {
            digest = res.headers['docker-content-digest'];
        }
        if (Array.isArray(digest))
            digest = digest[0] || '';

        return digest || '';

    } catch (e) {
        logger.debug && logger.debug('Failed to fetch manifest digest', e.message || e);
        return '';
    }
}

//- - - - - - - - - - - - -//

// Logger that prefers @actions/core when available
function getLogger() {
    const hasCore = !!(core && typeof core.debug === 'function');
    
    if (!hasCore) 
        return console;
    
    return {
        debug: (msg) => core.debug(typeof msg === 'string' ? msg : JSON.stringify(msg)),
        info: (msg) => core.info(typeof msg === 'string' ? msg : JSON.stringify(msg)),
        error: (msg) => core.error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    };
}

//- - - - - - - - - - - - -//

// Centralized output writer: prefers @actions/core, falls back to GITHUB_OUTPUT file, else stdout
async function setOutput(name, value) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    // try core.setOutput when running as an action
    try {
        core.setOutput(name, json);
        return;
    } catch (e) {
        // if core isn't available or throws, we'll try GITHUB_OUTPUT
    }

    if (!process.env.GITHUB_OUTPUT) 
        // Last-resort: print to stdout so local runs can capture it
        console.log(`${name}=${json}`)

    try {
        const fs = await import('fs');
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${json}\nEOF\n`);
        return;
    } catch (e) {
        // ignore and fallthrough to stdout
    }
    
}

//-------------------------//

async function main() {

    const repo = envOrInput('repo');
    const dockerUsername = envOrInput('docker_username');
    const dockerhubToken = envOrInput('dockerhub_token');

    validateInputs(repo, dockerUsername, dockerhubToken);

    // Fetch tags
    let repoTagsJson;
    try {
        repoTagsJson = await fetchRepoTags(repo, { dockerUsername, dockerhubToken, pageSize: 100 });
        core.debug(JSON.stringify(repoTagsJson));
    } catch (e) {
        core.error(JSON.stringify({ error: 'fetch-failed', repo }));
        core.error(JSON.stringify(e));
        process.exit(1);
    }


    let tag = pickTagFromApiJson(repoTagsJson);
    if (!tag) {
        core.error(JSON.stringify({ error: 'no-tag-found', repo }));
        process.exit(3);
    }

    // Resolve token (await the helper)
    let token = await fetchRegistryToken(repo, { dockerUsername, dockerhubToken });

    // Fetch manifest digest via helper
    const digest = await fetchManifestDigest(repo, tag, token);


    const picked_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const result = {
        repository: repo,
        tag,
        digest: digest || '',
        picked_at,
        ref: digest ? `${repo}@${digest}` : `${repo}:${tag}`
    };

    // Print result as JSON and write to the GitHub Actions output
    const json = JSON.stringify(result);
    console.log(json);
    await setOutput('result', json);


    process.exit(0);
}

//#########################//

// Only run main when executed directly (allows importing functions in tests)
if (typeof require !== 'undefined' && require.main === module) {
    main();
}
