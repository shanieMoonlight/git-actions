"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const docker_utils_1 = require("@git-actions/docker-utils");
const process_1 = __importDefault(require("process"));
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
        process_1.default.exit(2);
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
            return val;
    }
    catch (e) {
        // fall back to env
    }
    const envName = `INPUT_${name.toUpperCase()}`;
    return process_1.default.env[envName] || process_1.default.env[name.toUpperCase()] || '';
} //- - - - - - - - - - - - -//
// Logger that prefers @actions/core when available
function getLogger() {
    const hasCore = !!(core && typeof core.debug === 'function');
    if (!hasCore)
        return console;
    return {
        debug: (...msgs) => core.debug(msgs.map(m => typeof m === 'string' ? m : JSON.stringify(m)).join(' ')),
        info: (...msgs) => core.info(msgs.map(m => typeof m === 'string' ? m : JSON.stringify(m)).join(' ')),
        error: (...msgs) => core.error(msgs.map(m => typeof m === 'string' ? m : JSON.stringify(m)).join(' '))
    };
}
//- - - - - - - - - - - - -//
// Centralized output writer: prefers @actions/core, falls back to GITHUB_OUTPUT file, else stdout
async function setOutput(name, value) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    try {
        core.setOutput(name, json);
        return;
    }
    catch (e) {
        // if core isn't available or throws, we'll try GITHUB_OUTPUT
    }
    if (!process_1.default.env.GITHUB_OUTPUT)
        // Last-resort: print to stdout so local runs can capture it
        console.log(`${name}=${json}`);
    try {
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        fs.appendFileSync(process_1.default.env.GITHUB_OUTPUT, `${name}<<EOF\n${json}\nEOF\n`);
        return;
    }
    catch (e) {
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
        repoTagsJson = await (0, docker_utils_1.fetchRepoTags)(repo, { dockerUsername, dockerhubToken }, { pageSize: 100 });
        core.debug(JSON.stringify(repoTagsJson));
    }
    catch (e) {
        core.error(JSON.stringify({ error: 'fetch-failed', repo }));
        core.error(JSON.stringify(e));
        process_1.default.exit(1);
    }
    let tag = (0, docker_utils_1.selectLatestTagFromApiJson)(repoTagsJson);
    if (!tag) {
        core.error(JSON.stringify({ error: 'no-tag-found', repo }));
        process_1.default.exit(3);
    }
    // Resolve token (await the helper)
    let token = await (0, docker_utils_1.fetchRegistryToken)(repo, { dockerUsername, dockerhubToken });
    // Fetch manifest digest via helper
    const digest = await (0, docker_utils_1.fetchManifestDigest)(repo, tag, token);
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
    getLogger().info('Result: ', json);
    await setOutput('result', json);
    process_1.default.exit(0);
}
//#########################//
// Only run main when executed directly (allows importing functions in tests)
if (typeof require !== 'undefined' && require.main === module) {
    main();
}
