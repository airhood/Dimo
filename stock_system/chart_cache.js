const fs = require('fs');
const { serverLog } = require('../server/server_logger');

// key → { filepath, filename, timestamp } | { promise, timestamp }
const chartCache = new Map();

// Keep charts alive for 30 seconds — long enough to deduplicate
// concurrent requests within the same 1-minute update cycle.
const CHART_TTL_MS = 30 * 1000;

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
            return { filepath: cached.filepath, filename: cached.filename };
        }
        // Expired — delete old file and regenerate
        try {
            fs.unlink(cached.filepath, () => {});
        } catch {}
        chartCache.delete(key);
    }

    // Cache miss — kick off generation and store the promise immediately
    // so concurrent callers reuse the same in-flight request.
    const promise = (async () => {
        try {
            const result = await generateFn();
            chartCache.set(key, {
                filepath: result.filepath,
                filename: result.filename,
                timestamp: Date.now(),
            });
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
