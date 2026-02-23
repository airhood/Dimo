const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');

// uid → { channelId, messageId, client, updateFn, userId, type, isChart, startedAt }
const sessions = new Map();

// Non-chart sessions: update every minute.
schedule.scheduleJob('* * * * *', async () => {
    for (const [uid, session] of sessions) {
        if (session.isChart) continue;
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

// Chart sessions: update every 5 minutes.
schedule.scheduleJob('*/5 * * * *', async () => {
    for (const [uid, session] of sessions) {
        if (!session.isChart) continue;
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
            serverLog(`[ERROR] Realtime chart update error for session ${uid}: ${err}`);
            stopSession(uid);
        }
    }
});

function startSession(uid, userId, type, channelId, messageId, client, updateFn, isChart = false) {
    sessions.set(uid, { channelId, messageId, client, updateFn, userId, type, isChart, startedAt: new Date() });
}

function stopSession(uid) {
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
