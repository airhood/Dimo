const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');

// uid → { channelId, messageId, client, updateFn, userId, type, isChart, startedAt, sessionType, params }
const sessions = new Map();

const STATE_FILE = path.join(__dirname, '../data/realtime_sessions.json');

// ── 상태 저장/복원 ─────────────────────────────────────────────────────────────

function saveState() {
    const toSave = [];
    for (const [uid, session] of sessions) {
        toSave.push({
            uid,
            userId: session.userId,
            type: session.type,
            channelId: session.channelId,
            messageId: session.messageId,
            isChart: session.isChart,
            startedAt: session.startedAt,
            sessionType: session.sessionType,
            params: session.params,
        });
    }
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ sessions: toSave }));
    } catch (err) {
        serverLog(`[ERROR] Failed to save realtime sessions: ${err}`);
    }
}

function loadPersistedSessions() {
    try {
        if (!fs.existsSync(STATE_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        return data.sessions ?? [];
    } catch (err) {
        serverLog(`[ERROR] Failed to load realtime sessions: ${err}`);
        return [];
    }
}

// ── 스케줄러 ──────────────────────────────────────────────────────────────────

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

// ── 세션 관리 ─────────────────────────────────────────────────────────────────

function startSession(uid, userId, type, channelId, messageId, client, updateFn, isChart = false, sessionType = '', params = {}) {
    sessions.set(uid, { channelId, messageId, client, updateFn, userId, type, isChart, startedAt: new Date(), sessionType, params });
    saveState();
}

// 재시작 복원용 (startedAt 유지, saveState 호출 안 함)
function restoreSession(uid, userId, type, channelId, messageId, client, updateFn, isChart, sessionType, params, startedAt) {
    sessions.set(uid, { channelId, messageId, client, updateFn, userId, type, isChart, startedAt: new Date(startedAt), sessionType, params });
}

function stopSession(uid) {
    sessions.delete(uid);
    saveState();
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

module.exports = { startSession, restoreSession, stopSession, getSessionsByUser, stopSessionByIndex, loadPersistedSessions };
