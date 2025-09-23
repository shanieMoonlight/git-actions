import process from 'process';
import * as core from '@actions/core';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { request } from 'undici';

//##############################################//

// HTTP helpers
async function fetchJson(url, options = {}) {
    const res = await request(url, options);
    const json = await res.body.json();
    return { status: res.statusCode, json };
}

//----------------------------------------------//

async function fetchText(url, options = {}) {
    const res = await request(url, options);
    return { status: res.statusCode, headers: res.headers, body: await res.body.text() };
}

//----------------------------------------------//

// Registry token helper
async function fetchRegistryToken(repo, { dockerUsername = '', dockerhubToken = '' } = {}) {
    if (!dockerUsername || !dockerhubToken) {
        core.debug('No credentials provided, skipping token fetch');
        return '';
    }

    try {
        const res = await fetchJson(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`, {
            headers: {
                Authorization: `Basic ${Buffer.from(`${dockerUsername}:${dockerhubToken}`).toString('base64')}`
            }
        });

        if (res.status === 200 && res.json.token) {
            return res.json.token;
        }
    } catch (e) {
        core.debug(`Failed to fetch registry token: ${e.message}`);
    }

    return '';
}

//----------------------------------------------//

// Helper to parse last_updated or extract timestamp from name like 20230101_123456
function scoreEntry(entry) {
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

//----------------------------------------------//

// Pick tag from API JSON
function pickTagFromApiJson(apiJson) {
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

//----------------------------------------------//

// Fetch tags from Docker Hub
async function fetchRepoTags(repo, { dockerUsername = '', dockerhubToken = '', pageSize = 100, maxPages = 5 } = {}) {
    const base = `https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=${pageSize}`;
    const combined = [];
    let url = base;
    let page = 0;

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
        url = (bodyJson && typeof bodyJson.next === 'string') ? bodyJson.next : null;
    }

    return { results: combined };
}

//----------------------------------------------//

// Fetch manifest digest
async function fetchManifestDigest(repo, tag, token) {
    if (!token) return '';

    try {
        const res = await fetchText(`https://registry-1.docker.io/v2/${repo}/manifests/${tag}`, {
            method: 'HEAD',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.docker.distribution.manifest.v2+json'
            }
        });

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
        if (Array.isArray(digest)) digest = digest[0] || '';

        return digest || '';
    } catch (e) {
        return '';
    }
}

//----------------------------------------------//

// Resolve latest tag for a repo
async function resolveLatestTag(repo, dockerUsername, dockerhubToken) {
    try {
        const repoTagsJson = await fetchRepoTags(repo, { dockerUsername, dockerhubToken });
        const tag = pickTagFromApiJson(repoTagsJson);
        if (!tag) throw new Error('No tag found');

        const token = await fetchRegistryToken(repo, { dockerUsername, dockerhubToken });
        const digest = await fetchManifestDigest(repo, tag, token);

        const picked_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        const result = {
            repository: repo,
            tag,
            digest: digest || '',
            picked_at,
            ref: digest ? `${repo}@${digest}` : `${repo}:${tag}`
        };

        return result;
    } catch (err) {
        throw new Error(`Failed to resolve tag for ${repo}: ${err.message}`);
    }
}

//##############################################//

async function main() {
    const templatePath = core.getInput('template', { required: true });
    const servicesPath = core.getInput('services', { required: true });
    const dockerUsername = core.getInput('docker_username') || '';
    const dockerhubToken = core.getInput('dockerhub_token') || '';

    // Read template
    let template;
    try {
        template = readFileSync(templatePath, 'utf8');
    } catch (e) {
        core.error(`Failed to read template: ${templatePath}`);
        process.exit(1);
    }

    // Read services JSON
    let services;
    try {
        const servicesContent = readFileSync(servicesPath, 'utf8');
        services = JSON.parse(servicesContent);
        if (!services.services || !Array.isArray(services.services)) {
            throw new Error('Invalid services JSON: missing services array');
        }
    } catch (e) {
        core.error(`Failed to read/parse services JSON: ${servicesPath} - ${e.message}`);
        process.exit(1);
    }

    if (services.services.length === 0) {
        core.error('No services defined in services JSON');
        process.exit(1);
    }

    // Ensure state directory exists
    mkdirSync('state', { recursive: true });

    // Process each service
    for (const service of services.services) {
        const { name, repo, placeholder } = service;
        if (!name || !repo || !placeholder) {
            core.error(`Invalid service definition: ${JSON.stringify(service)}`);
            process.exit(1);
        }

        core.info(`==> Processing service: ${name} (repo: ${repo}) placeholder: ${placeholder}`);

        try {
            const result = await resolveLatestTag(repo, dockerUsername, dockerhubToken);
            const statePath = `state/${name}.json`;
            writeFileSync(statePath, JSON.stringify(result, null, 2));
            core.info(`Resolved: ${JSON.stringify(result)}`);

            const ref = result.digest ? `${result.repository}@${result.digest}` : `${result.repository}:${result.tag}`;
            template = template.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ref);
        } catch (e) {
            core.error(`Failed to process service ${name}: ${e.message}`);
            process.exit(1);
        }
    }

    // Write rendered docker-compose.yml
    writeFileSync('docker-compose.yml', template);
    core.info('Rendered docker-compose.yml (preview):');
    core.info(template.substring(0, 2000)); // Limit output
}

// Only run main when executed directly
if (typeof require !== 'undefined' && require.main === module) {
    main();
}

//##############################################//
