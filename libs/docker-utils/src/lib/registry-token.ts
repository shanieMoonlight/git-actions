import { DockerCredentials } from './docker-credentials.js';
import { fetchJson } from './http.js';
import { ILogger } from './i-logger.js';


//#########################//


export async function fetchRegistryToken(
  repo: string,
  dockerCredentials: DockerCredentials = {},
  logger: ILogger = console): Promise<string> {

  try {

    const { dockerUsername, dockerhubToken } = dockerCredentials
    const tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`;

    
    const headers: Record<string, string> = {};
    if (dockerUsername && dockerhubToken) {
      const auth = Buffer.from(`${dockerUsername}:${dockerhubToken}`).toString('base64');
      headers.Authorization = `Basic ${auth}`;
    }

    const res = await fetchJson(tokenUrl, { headers });
    const token = res && res.json && res.json.token ? res.json.token : '';
    return token;
    

  } catch (e: any) {
    logger.error('Failed to fetch registry token', e.message || e);
    logger.error(JSON.stringify(e));
    logger.error('Continuing without token, digest will be empty');
    return '';
  }

}
