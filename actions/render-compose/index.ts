import * as core from '@actions/core';
import {
  fetchManifestDigest,
  fetchRegistryToken,
  fetchRepoTags,
  selectLatestTagFromApiJson
} from '@git-actions/docker-utils';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import process from 'process';

//##############################################//

interface ServiceConfig {
  name: string;
  repo: string;
  placeholder: string;
}

interface ServicesConfig {
  services: ServiceConfig[];
}

interface ResolvedTag {
  repository: string;
  tag: string;
  digest: string;
  picked_at: string;
  ref: string;
}

//##############################################//

// Resolve latest tag for a repo
async function resolveLatestTag(repo: string, dockerUsername: string, dockerhubToken: string): Promise<ResolvedTag> {
    try {
       
        const repoTagsJson = await fetchRepoTags(repo, { dockerUsername, dockerhubToken }, {}, console);
        const tag = selectLatestTagFromApiJson(repoTagsJson);
        
        if (!tag) 
            throw new Error('No tag found');

        const token = await fetchRegistryToken(repo, { dockerUsername, dockerhubToken }, console);
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
        throw new Error(`Failed to resolve tag for ${repo}: ${(err as Error).message}`);
    }
}

//##############################################//

async function main(): Promise<void> {
    const templatePath = core.getInput('template', { required: true });
    const servicesPath = core.getInput('services', { required: true });
    const dockerUsername = core.getInput('docker_username') || '';
    const dockerhubToken = core.getInput('dockerhub_token') || '';

    // Read template
    let template: string;
    try {
        template = readFileSync(templatePath, 'utf8');
    } catch (e) {
        core.error(`Failed to read template: ${templatePath}`);
        process.exit(1);
    }

    // Read services JSON
    let services: ServicesConfig;
    try {
        const servicesContent = readFileSync(servicesPath, 'utf8');
        services = JSON.parse(servicesContent);
        if (!services.services || !Array.isArray(services.services)) {
            throw new Error('Invalid services JSON: missing services array');
        }
    } catch (e) {
        core.error(`Failed to read/parse services JSON: ${servicesPath} - ${(e as Error).message}`);
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
            core.error(`Failed to process service ${name}: ${(e as Error).message}`);
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
