import * as core from '@actions/core';
import { fetchManifestDigest, fetchRegistryToken, fetchRepoTags, selectLatestTagFromApiJson } from '@git-actions/docker-utils';
import process from 'process';
// import { fetchRegistryToken } from './registry-token.js';


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


    // If only one of username/token is provided, warn the user
    if ((!!dockerUsername && !dockerhubToken) || (!dockerUsername && !!dockerhubToken))
        core.warning('Both docker_username and dockerhub_token should be provided for authenticated requests; proceeding unauthenticated.');

}

//- - - - - - - - - - - - -//

function envOrInput(name) {
    // Prefer @actions/core if available (works when running as an action)
    try {

        const val = core.getInput(name);
        if (val)
            return val

    } catch (e) {
        // fall back to env
    }
    const envName = `INPUT_${name.toUpperCase()}`;
    return process.env[envName] || process.env[name.toUpperCase()] || '';
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
        repoTagsJson = await fetchRepoTags(repo, { dockerUsername, dockerhubToken }, { pageSize: 100 });
        core.debug(JSON.stringify(repoTagsJson));
    } catch (e) {
        core.error(JSON.stringify({ error: 'fetch-failed', repo }));
        core.error(JSON.stringify(e));
        process.exit(1);
    }


    let tag = selectLatestTagFromApiJson(repoTagsJson);
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
    const json = JSON.stringify(result)
    getLogger().info('Result: ', json)
    await setOutput('result', json)


    process.exit(0);
}


//#########################//


// Only run main when executed directly (allows importing functions in tests)
if (typeof require !== 'undefined' && require.main === module) {
    main();
}
