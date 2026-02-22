const { serverLog } = require('../server/server_logger');

// userId → { intervalId, timeoutId, channelId, messageId }
const sessions = new Map();

const AUTO_STOP_MS = 60 * 60 * 1000; // 1 hour

async function startSession(userId, channelId, messageId, client, updateFn) {
    stopSession(userId);

    const intervalId = setInterval(async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            const update = await updateFn();
            await message.edit({
                embeds: update.embeds,
                files: update.files || [],
                components: message.components,
            });
        } catch (err) {
            serverLog(`[ERROR] Realtime update error for user ${userId}: ${err}`);
            stopSession(userId);
        }
    }, 60 * 1000);

    const timeoutId = setTimeout(async () => {
        try {
            const session = sessions.get(userId);
            if (session) {
                const channel = await client.channels.fetch(session.channelId);
                const message = await channel.messages.fetch(session.messageId);
                await message.edit({ components: [] });
            }
        } catch (err) {
            serverLog(`[ERROR] Realtime auto-stop cleanup error for user ${userId}: ${err}`);
        }
        stopSession(userId);
    }, AUTO_STOP_MS);

    sessions.set(userId, { intervalId, timeoutId, channelId, messageId });
}

function stopSession(userId) {
    const session = sessions.get(userId);
    if (!session) return;
    clearInterval(session.intervalId);
    clearTimeout(session.timeoutId);
    sessions.delete(userId);
}

function hasSession(userId) {
    return sessions.has(userId);
}

module.exports = { startSession, stopSession, hasSession };
