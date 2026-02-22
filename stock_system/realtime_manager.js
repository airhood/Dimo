const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');

// uid → { timeoutId, channelId, messageId, client, updateFn }
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

function startSession(uid, channelId, messageId, client, updateFn) {
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

    sessions.set(uid, { timeoutId, channelId, messageId, client, updateFn });
}

function stopSession(uid) {
    const session = sessions.get(uid);
    if (!session) return;
    clearTimeout(session.timeoutId);
    sessions.delete(uid);
}

module.exports = { startSession, stopSession };
