const fs = require('fs');
const { serverLog } = require('../server/server_logger');

// key → { result, timestamp } | { promise, timestamp }
const chartCache = new Map();

// Keep charts alive for 30 seconds — long enough to deduplicate
// concurrent requests within the same 1-minute update cycle.
const CHART_TTL_MS = 30 * 1000;

function deleteResultFiles(result) {
    try {
        const files = Array.isArray(result) ? result : [result];
        files.forEach(f => { if (f && f.filepath) fs.unlink(f.filepath, () => {}); });
    } catch {}
}

async function getCachedChart(key, generateFn) {
    const now = Date.now();
    const cached = chartCache.get(key);

    if (cached) {
        if (cached.promise) {
            // Generation already in flight — reuse it
            return cached.promise;
        }
        if (now - cached.timestamp < CHART_TTL_MS) {
            // Cache hit
            return cached.result;
        }
        // Expired — delete old files and regenerate
        deleteResultFiles(cached.result);
        chartCache.delete(key);
    }

    // Cache miss — kick off generation and store the promise immediately
    // so concurrent callers reuse the same in-flight request.
    const promise = (async () => {
        try {
            const result = await generateFn();
            chartCache.set(key, { result, timestamp: Date.now() });
            return result;
        } catch (err) {
            chartCache.delete(key);
            serverLog(`[ERROR] chart_cache: generation failed for key '${key}': ${err}`);
            throw err;
        }
    })();

    chartCache.set(key, { promise, timestamp: now });
    return promise;
}

module.exports = { getCachedChart };
