const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { serverLog } = require('../server/server_logger');
const { getStockPrice } = require('./stock_sim');
const { DIVIDEND_YIELDS } = require('../setting');
const User = require('../schemas/user');
const Asset = require('../schemas/asset');

const STATE_FILE = path.join(__dirname, '../data/dividend_state.json');
const PAYOUT_INTERVAL_DAYS = 3;

let discordClient = null;

function setClientForDividends(client) {
    discordClient = client;
}

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return { lastPayoutDate: null };
        }
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        serverLog(`[ERROR] Failed to load dividend_state.json: ${err}`);
        return { lastPayoutDate: null };
    }
}

function saveState(state) {
    try {
        const dataDir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
        serverLog(`[ERROR] Failed to save dividend_state.json: ${err}`);
    }
}

function isDue(lastPayoutDate) {
    if (!lastPayoutDate) return true;
    const last = new Date(lastPayoutDate);
    const now = new Date();
    const diffMs = now - last;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= PAYOUT_INTERVAL_DAYS;
}

async function distributeDividends() {
    if (!discordClient) {
        serverLog('[WARN] distributeDividends: discordClient not set');
        return;
    }

    serverLog('[INFO] Starting dividend distribution...');

    try {
        const users = await User.find({}).populate('asset');
        let totalPaid = 0;
        let payoutCount = 0;

        for (const user of users) {
            if (!user.asset) continue;

            const userAsset = user.asset;
            if (!userAsset.stocks || userAsset.stocks.length === 0) continue;

            // 보유 종목별 배당금 합산
            const dividendBreakdown = {};
            let totalDividend = 0;

            for (const holding of userAsset.stocks) {
                const ticker = holding.ticker;
                const yieldRate = DIVIDEND_YIELDS[ticker];
                if (!yieldRate) continue;

                const currentPrice = getStockPrice(ticker);
                if (currentPrice === null) continue;

                const dividend = Math.round(currentPrice * holding.quantity * (yieldRate / 100));
                if (dividend <= 0) continue;

                dividendBreakdown[ticker] = (dividendBreakdown[ticker] || 0) + dividend;
                totalDividend += dividend;
            }

            if (totalDividend <= 0) continue;

            // 잔액 추가
            userAsset.balance += totalDividend;
            userAsset.balance = Math.round(userAsset.balance);
            await userAsset.save();

            totalPaid += totalDividend;
            payoutCount++;

            // DM 알림
            try {
                const discordUser = await discordClient.users.fetch(user.userID);
                const breakdownText = Object.entries(dividendBreakdown)
                    .map(([ticker, amount]) => `**${ticker}**: ${amount.toLocaleString()}원`)
                    .join('\n');

                const embed = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle('💰 배당금 지급')
                    .setDescription('보유 주식에 대한 배당금이 지급되었습니다.')
                    .addFields(
                        { name: '종목별 배당금', value: breakdownText },
                        { name: '총 배당금', value: `**${totalDividend.toLocaleString()}원**` },
                    )
                    .setTimestamp();

                await discordUser.send({ embeds: [embed] });
            } catch (dmErr) {
                serverLog(`[WARN] Failed to send dividend DM to ${user.userID}: ${dmErr}`);
            }
        }

        serverLog(`[INFO] Dividend distribution complete. ${payoutCount} users paid, total: ${totalPaid.toLocaleString()}원`);
    } catch (err) {
        serverLog(`[ERROR] Error in distributeDividends: ${err}`);
    }
}

async function checkAndDistribute() {
    const state = loadState();
    if (!isDue(state.lastPayoutDate)) return;

    await distributeDividends();

    saveState({ lastPayoutDate: new Date().toISOString() });
}

function initDividendSystem() {
    serverLog('[INFO] Initializing dividend system...');

    // 매일 자정 한국시간 체크
    schedule.scheduleJob('0 0 * * *', () => {
        checkAndDistribute();
    });

    serverLog('[INFO] Dividend system initialized');
    return true;
}

exports.initDividendSystem = initDividendSystem;
exports.setClientForDividends = setClientForDividends;
