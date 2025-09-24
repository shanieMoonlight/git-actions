import { request } from 'undici';

//#########################//


export function normalizeHeaders(raw: unknown): Record<string, string | string[]> {
    const headers: Record<string, string | string[]> = {};
    if (Array.isArray(raw)) {
        for (const h of raw) {
            if (!h || !h.name) continue;
            const key = h.name.toLowerCase();
            const val = h.value || (h.values && h.values[0]) || '';
            if (!headers[key]) headers[key] = [];
            (headers[key] as string[]).push(val);
        }
    } else if (raw && typeof raw === 'object') {
        for (const k of Object.keys(raw)) {
            headers[k.toLowerCase()] = (raw as Record<string, string>)[k];
        }
    }
    return headers;
}

//- - - - - - - - - - - - -//

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}


//- - - - - - - - - - - - -//


export async function requestWithTimeout(url: string, opts: any = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await request(url, { ...opts, signal });
        const body = await res.body.text();
        const headers = normalizeHeaders(res.headers);
        return { status: res.statusCode, headers, body };
    } finally {
        clearTimeout(timer);
    }
}

//- - - - - - - - - - - - -//

export async function fetchText(url: string, opts: any = {}, attempts = 3, timeoutMs = 10000) {

    let lastErr: Error | null = null;

    for (let i = 1; i <= attempts; i++) {
        try {
            const res = await requestWithTimeout(url, opts, timeoutMs);
            // handle 429 (rate limit) — return early for non-429 to avoid nesting
            if (res.status !== 429)
                return res;

            const ra = res.headers['retry-after'];
            let wait = 1000 * Math.pow(2, i - 1);
            if (ra) {
                const parsed = parseInt(Array.isArray(ra) ? ra[0] : ra, 10);
                if (!Number.isNaN(parsed)) wait = parsed * 1000;
            }
            await sleep(wait);
            continue;
        } catch (e: any) {
            lastErr = e;
            // exponential backoff
            const backoff = Math.pow(2, i - 1) * 500;
            await sleep(backoff);
        }
    }
    throw lastErr;
}

//- - - - - - - - - - - - -//

export async function fetchJson(url: string, opts: any = {}, attempts = 3, timeoutMs = 10000) {
    const res = await fetchText(url, opts, attempts, timeoutMs);
    let json = null;
    try {
        json = JSON.parse(res.body);
    } catch (e: unknown) {
        json = null;
    }

    return { status: res.status, body: res.body, json };
}

//#########################//