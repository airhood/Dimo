const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');

// uid → { timeoutId, channelId, messageId, client, updateFn, userId, type, startedAt }
const sessions = new Map();

const AUTO_STOP_MS = 60 * 60 * 1000; // 1 hour

// Single job fires every minute on the dot — all sessions update together,
// maximising chart cache hit rate.
schedule.scheduleJob('* * * * *', async () => {
    for (const [uid, session] of sessions) {
        try {
            const channel = await session.client.channels.fetch(session.channelId);
            const message = await channel.messages.fetch(session.messageId);
            const update = await session.updateFn();
            await message.edit({
                embeds: update.embeds,
                files: update.files || [],
                components: message.components,
            });
        } catch (err) {
            serverLog(`[ERROR] Realtime update error for session ${uid}: ${err}`);
            stopSession(uid);
        }
    }
});

function startSession(uid, userId, type, channelId, messageId, client, updateFn) {
    const timeoutId = setTimeout(async () => {
        try {
            const session = sessions.get(uid);
            if (session) {
                const channel = await client.channels.fetch(session.channelId);
                const message = await channel.messages.fetch(session.messageId);
                await message.edit({ components: [] });
            }
        } catch (err) {
            serverLog(`[ERROR] Realtime auto-stop cleanup error for session ${uid}: ${err}`);
        }
        stopSession(uid);
    }, AUTO_STOP_MS);

    sessions.set(uid, { timeoutId, channelId, messageId, client, updateFn, userId, type, startedAt: new Date() });
}

function stopSession(uid) {
    const session = sessions.get(uid);
    if (!session) return;
    clearTimeout(session.timeoutId);
    sessions.delete(uid);
}

// Returns the user's active sessions sorted by start time, with 1-based index.
function getSessionsByUser(userId) {
    const result = [];
    for (const [uid, session] of sessions) {
        if (session.userId === userId) {
            result.push({ uid, type: session.type, startedAt: session.startedAt });
        }
    }
    result.sort((a, b) => a.startedAt - b.startedAt);
    return result;
}

// Stop the nth session (1-based) for a user.
// Returns the stopped session data (channelId, messageId) or null if not found.
function stopSessionByIndex(userId, index) {
    const list = getSessionsByUser(userId);
    const entry = list[index - 1];
    if (!entry) return null;
    const session = sessions.get(entry.uid);
    stopSession(entry.uid);
    return session ?? null;
}

module.exports = { startSession, stopSession, getSessionsByUser, stopSessionByIndex };
