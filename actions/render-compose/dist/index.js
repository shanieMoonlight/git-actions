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
const fs_1 = require("fs");
const process_1 = __importDefault(require("process"));
//##############################################//
// Resolve latest tag for a repo
async function resolveLatestTag(repo, dockerUsername, dockerhubToken) {
    try {
        const repoTagsJson = await (0, docker_utils_1.fetchRepoTags)(repo, { dockerUsername, dockerhubToken }, {}, console);
        const tag = (0, docker_utils_1.selectLatestTagFromApiJson)(repoTagsJson);
        if (!tag)
            throw new Error('No tag found');
        const token = await (0, docker_utils_1.fetchRegistryToken)(repo, { dockerUsername, dockerhubToken }, console);
        const digest = await (0, docker_utils_1.fetchManifestDigest)(repo, tag, token);
        const picked_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        const result = {
            repository: repo,
            tag,
            digest: digest || '',
            picked_at,
            ref: digest ? `${repo}@${digest}` : `${repo}:${tag}`
        };
        return result;
    }
    catch (err) {
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
        template = (0, fs_1.readFileSync)(templatePath, 'utf8');
    }
    catch (e) {
        core.error(`Failed to read template: ${templatePath}`);
        process_1.default.exit(1);
    }
    // Read services JSON
    let services;
    try {
        const servicesContent = (0, fs_1.readFileSync)(servicesPath, 'utf8');
        services = JSON.parse(servicesContent);
        if (!services.services || !Array.isArray(services.services)) {
            throw new Error('Invalid services JSON: missing services array');
        }
    }
    catch (e) {
        core.error(`Failed to read/parse services JSON: ${servicesPath} - ${e.message}`);
        process_1.default.exit(1);
    }
    if (services.services.length === 0) {
        core.error('No services defined in services JSON');
        process_1.default.exit(1);
    }
    // Ensure state directory exists
    (0, fs_1.mkdirSync)('state', { recursive: true });
    // Process each service
    for (const service of services.services) {
        const { name, repo, placeholder } = service;
        if (!name || !repo || !placeholder) {
            core.error(`Invalid service definition: ${JSON.stringify(service)}`);
            process_1.default.exit(1);
        }
        core.info(`==> Processing service: ${name} (repo: ${repo}) placeholder: ${placeholder}`);
        try {
            const result = await resolveLatestTag(repo, dockerUsername, dockerhubToken);
            const statePath = `state/${name}.json`;
            (0, fs_1.writeFileSync)(statePath, JSON.stringify(result, null, 2));
            core.info(`Resolved: ${JSON.stringify(result)}`);
            const ref = result.digest ? `${result.repository}@${result.digest}` : `${result.repository}:${result.tag}`;
            template = template.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ref);
        }
        catch (e) {
            core.error(`Failed to process service ${name}: ${e.message}`);
            process_1.default.exit(1);
        }
    }
    // Write rendered docker-compose.yml
    (0, fs_1.writeFileSync)('docker-compose.yml', template);
    core.info('Rendered docker-compose.yml (preview):');
    core.info(template.substring(0, 2000)); // Limit output
}
// Only run main when executed directly
if (typeof require !== 'undefined' && require.main === module) {
    main();
}
//##############################################//
