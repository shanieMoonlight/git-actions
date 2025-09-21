import { fetchJson } from './http.js';

export async function fetchRegistryToken(repo, { dockerUsername = '', dockerhubToken = '', logger = console } = {}) {
  try {
    const tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`;

    if (dockerUsername && dockerhubToken) {
      const auth = Buffer.from(`${dockerUsername}:${dockerhubToken}`).toString('base64');
      const res = await fetchJson(tokenUrl, { headers: { Authorization: `Basic ${auth}` } });
      const token = res && res.json && res.json.token ? res.json.token : '';
      return token;
    } else {
      const res = await fetchJson(tokenUrl);
      const token = res && res.json && res.json.token ? res.json.token : '';
      return token;
    }
  } catch (e) {
    logger.error && logger.error('Failed to fetch registry token', e.message || e);
    logger.error && logger.error(JSON.stringify(e));
    logger.error && logger.error('Continuing without token, digest will be empty');
    return '';
  }
}
