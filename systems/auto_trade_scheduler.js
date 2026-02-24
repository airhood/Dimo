'use strict';

const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');
const { executeScript } = require('./auto_trade_interpreter');
const AutoTrade = require('../schemas/auto_trade');

const MAX_LOGS = 50;
const MAX_TRADES = 200;

let discordClient = null;

function setClientForAutoTrade(client) {
    discordClient = client;
}

async function runAutoTrades() {
    try {
        const entries = await AutoTrade.find({ isRunning: true });

        for (const entry of entries) {
            try {
                const { logs, trades, error } = await executeScript(
                    entry.userId,
                    entry.accountKey,
                    entry.script,
                    discordClient
                );

                const now = new Date();
                const newLogEntries = [];

                for (const msg of logs) {
                    newLogEntries.push({ timestamp: now, message: msg });
                }

                if (error) {
                    newLogEntries.push({ timestamp: now, message: `[오류] ${error}` });
                }

                // Append new logs and cap at MAX_LOGS
                const combined = [...entry.logs, ...newLogEntries];
                entry.logs = combined.slice(-MAX_LOGS);

                // Append new trades and cap at MAX_TRADES
                const newTradeEntries = (trades ?? []).map(t => ({
                    timestamp: now,
                    summary: t.summary,
                    success: t.success,
                }));
                const combinedTrades = [...(entry.trades ?? []), ...newTradeEntries];
                entry.trades = combinedTrades.slice(-MAX_TRADES);

                entry.lastRunAt = now;
                entry.lastError = error ?? null;

                await entry.save();

                if (error) {
                    serverLog(`[AUTO_TRADE] Error for user ${entry.userId} (${entry.accountKey}): ${error}`);
                } else {
                    serverLog(`[AUTO_TRADE] Ran script for user ${entry.userId} (${entry.accountKey}), ${newLogEntries.length} log entries`);
                }
            } catch (err) {
                serverLog(`[AUTO_TRADE] Unexpected error for user ${entry.userId}: ${err}`);
                try {
                    entry.lastError = String(err.message ?? err);
                    entry.lastRunAt = new Date();
                    await entry.save();
                } catch (_) { /* ignore save errors */ }
            }
        }
    } catch (err) {
        serverLog(`[AUTO_TRADE] Failed to load auto-trade entries: ${err}`);
    }
}

function initAutoTradeScheduler() {
    schedule.scheduleJob('* * * * *', () => {
        runAutoTrades();
    });
    serverLog('[INFO] Auto-trade scheduler initialized');
    return true;
}

exports.setClientForAutoTrade = setClientForAutoTrade;
exports.initAutoTradeScheduler = initAutoTradeScheduler;
