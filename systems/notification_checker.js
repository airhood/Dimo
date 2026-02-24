const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');
const { getStockPrice, getFuturePrice, getOptionPrice } = require('./stock_sim');
const { getFundPrice } = require('./fund_price');
const { getEtfPrice } = require('./etf_system');
const { OPTION_UNIT_QUANTITY } = require('../setting');
const { EmbedBuilder } = require('discord.js');
const Notification = require('../schemas/notification');
const User = require('../schemas/user');
const Asset = require('../schemas/asset');

let discordClient = null;

function setClientForNotifications(client) {
    discordClient = client;
}

// ── P&L 계산 ─────────────────────────────────────────────────────────────────

function calculatePositionPnL(type, positionNum, userAsset) {
    if (type === 'stock') {
        const pos = userAsset.stocks[positionNum - 1];
        if (!pos) return null;
        const currentPrice = getStockPrice(pos.ticker);
        if (currentPrice === null) return null;
        return (currentPrice - pos.purchasePrice) * pos.quantity;
    }

    if (type === 'future') {
        const pos = userAsset.futures[positionNum - 1];
        if (!pos) return null;
        const currentPrice = getFuturePrice(pos.ticker);
        if (currentPrice === null) return null;
        return (currentPrice - pos.purchasePrice) * pos.quantity * pos.leverage;
    }

    if (type === 'option') {
        const pos = userAsset.options[positionNum - 1];
        if (!pos) return null;
        const optionPrices = getOptionPrice(pos.ticker);
        if (!optionPrices) return null;
        const priceMap = pos.optionType === 'call' ? optionPrices.call : optionPrices.put;
        const currentPrice = priceMap[pos.strikePrice.toString()];
        if (currentPrice === undefined) return null;
        return (currentPrice - pos.purchasePrice) * pos.quantity * OPTION_UNIT_QUANTITY;
    }

    if (type === 'binary_option') {
        const pos = userAsset.binary_options[positionNum - 1];
        if (!pos) return null;
        const currentPrice = getStockPrice(pos.ticker);
        if (currentPrice === null) return null;
        const isWinning = pos.optionType === 'call'
            ? currentPrice > pos.strikePrice
            : currentPrice < pos.strikePrice;
        return isWinning ? pos.amount : -pos.amount;
    }

    if (type === 'etf') {
        const pos = userAsset.etfs?.[positionNum - 1];
        if (!pos) return null;
        const currentPrice = getEtfPrice(pos.etfId);
        if (currentPrice === null || currentPrice === undefined) return null;
        return (currentPrice - pos.purchasePrice) * pos.quantity;
    }

    return null;
}

function calculateTickerPnL(type, ticker, strikePrice, userAsset) {
    if (type === 'stock') {
        const currentPrice = getStockPrice(ticker);
        if (currentPrice === null) return null;
        return userAsset.stocks
            .filter(h => h.ticker === ticker)
            .reduce((sum, h) => sum + (currentPrice - h.purchasePrice) * h.quantity, 0);
    }

    if (type === 'future') {
        const currentPrice = getFuturePrice(ticker);
        if (currentPrice === null) return null;
        return userAsset.futures
            .filter(h => h.ticker === ticker)
            .reduce((sum, h) => sum + (currentPrice - h.purchasePrice) * h.quantity * h.leverage, 0);
    }

    if (type === 'option') {
        const optionPrices = getOptionPrice(ticker);
        if (!optionPrices) return null;
        const holdings = userAsset.options.filter(
            o => o.ticker === ticker && (strikePrice == null || o.strikePrice === strikePrice)
        );
        return holdings.reduce((sum, h) => {
            const priceMap = h.optionType === 'call' ? optionPrices.call : optionPrices.put;
            const currentPrice = priceMap[h.strikePrice.toString()];
            if (currentPrice === undefined) return sum;
            return sum + (currentPrice - h.purchasePrice) * h.quantity * OPTION_UNIT_QUANTITY;
        }, 0);
    }

    if (type === 'binary_option') {
        const holdings = userAsset.binary_options.filter(h => h.ticker === ticker);
        let total = 0;
        for (const h of holdings) {
            const currentPrice = getStockPrice(h.ticker);
            if (currentPrice === null) return null;
            const isWinning = h.optionType === 'call'
                ? currentPrice > h.strikePrice
                : currentPrice < h.strikePrice;
            total += isWinning ? h.amount : -h.amount;
        }
        return total;
    }

    if (type === 'fund') {
        const currentUnitPrice = getFundPrice(ticker);
        if (currentUnitPrice === null) return null;
        return userAsset.funds
            .filter(f => f.name === ticker)
            .reduce((sum, h) => sum + (currentUnitPrice - h.purchasePrice) * h.unit, 0);
    }

    if (type === 'etf') {
        const currentPrice = getEtfPrice(ticker);
        if (currentPrice === null || currentPrice === undefined) return null;
        return (userAsset.etfs ?? [])
            .filter(e => e.etfId === ticker)
            .reduce((sum, e) => sum + (currentPrice - e.purchasePrice) * e.quantity, 0);
    }

    return null;
}

function calculateAccountPnL(userAsset) {
    let total = 0;

    for (const h of userAsset.stocks) {
        const currentPrice = getStockPrice(h.ticker);
        if (currentPrice !== null) total += (currentPrice - h.purchasePrice) * h.quantity;
    }

    for (const h of userAsset.futures) {
        const currentPrice = getFuturePrice(h.ticker);
        if (currentPrice !== null) total += (currentPrice - h.purchasePrice) * h.quantity * h.leverage;
    }

    for (const h of userAsset.options) {
        const optionPrices = getOptionPrice(h.ticker);
        if (!optionPrices) continue;
        const priceMap = h.optionType === 'call' ? optionPrices.call : optionPrices.put;
        const currentPrice = priceMap[h.strikePrice.toString()];
        if (currentPrice !== undefined) {
            total += (currentPrice - h.purchasePrice) * h.quantity * OPTION_UNIT_QUANTITY;
        }
    }

    for (const h of userAsset.funds) {
        const currentUnitPrice = getFundPrice(h.name);
        if (currentUnitPrice !== null) total += (currentUnitPrice - h.purchasePrice) * h.unit;
    }

    for (const e of (userAsset.etfs ?? [])) {
        const currentPrice = getEtfPrice(e.etfId);
        if (currentPrice !== null && currentPrice !== undefined) {
            total += (currentPrice - e.purchasePrice) * e.quantity;
        }
    }

    return total;
}

function calculatePnL(notification, userAsset) {
    const { alertScope, type, positionNum, ticker, strikePrice } = notification;

    if (alertScope === 'position') {
        return calculatePositionPnL(type, positionNum, userAsset);
    }
    if (alertScope === 'ticker') {
        return calculateTickerPnL(type, ticker, strikePrice ?? null, userAsset);
    }
    if (alertScope === 'account') {
        return calculateAccountPnL(userAsset);
    }

    return null;
}

// ── 체크 간격 계산 ─────────────────────────────────────────────────────────────

function calculateCheckInterval(currentPnL, targetPnL, direction) {
    const remaining = direction === 'above'
        ? targetPnL - currentPnL
        : currentPnL - targetPnL;

    if (remaining <= 0) return 1;

    const ratio = Math.abs(targetPnL) > 0
        ? remaining / Math.abs(targetPnL)
        : 1;

    if (ratio > 0.3) return 20;
    if (ratio > 0.1) return 10;
    if (ratio > 0.03) return 3;
    return 1;
}

// ── 알림 DM 텍스트 ─────────────────────────────────────────────────────────────

const TYPE_NAMES = {
    stock: '주식',
    future: '선물',
    option: '옵션',
    binary_option: '바이너리 옵션',
    fund: '펀드',
    etf: 'ETF',
};

const SCOPE_NAMES = {
    position: '포지션',
    ticker: '종목',
    account: '계좌',
};

function buildSubjectText(notification) {
    const { alertScope, type, positionNum, ticker, strikePrice } = notification;
    if (alertScope === 'position') {
        const typeName = TYPE_NAMES[type] || type;
        return `${typeName} 포지션 #${positionNum}`;
    }
    if (alertScope === 'ticker') {
        const typeName = TYPE_NAMES[type] || type;
        const strikePriceText = strikePrice != null ? ` (행사가: ${strikePrice.toLocaleString()}원)` : '';
        return `${typeName} - ${ticker}${strikePriceText}`;
    }
    return '전체 계좌';
}

// ── 메인 체커 ──────────────────────────────────────────────────────────────────

async function checkNotifications() {
    if (!discordClient) return;

    try {
        const now = new Date();
        const dueNotifications = await Notification.find({ nextCheckAt: { $lte: now } });

        for (const notification of dueNotifications) {
            try {
                const user = await User.findOne({ userID: notification.userID });
                if (!user) {
                    await Notification.deleteOne({ _id: notification._id });
                    continue;
                }

                const userAsset = await Asset.findById(user.asset);
                if (!userAsset) {
                    await Notification.deleteOne({ _id: notification._id });
                    continue;
                }

                const currentPnL = calculatePnL(notification, userAsset);
                if (currentPnL === null) {
                    notification.nextCheckAt = new Date(Date.now() + 60 * 1000);
                    await notification.save();
                    continue;
                }

                const triggered = notification.direction === 'above'
                    ? currentPnL >= notification.targetPnL
                    : currentPnL <= notification.targetPnL;

                if (triggered) {
                    try {
                        const discordUser = await discordClient.users.fetch(notification.userID);
                        const directionText = notification.direction === 'above' ? '이상' : '이하';
                        const subjectText = buildSubjectText(notification);
                        const scopeName = SCOPE_NAMES[notification.alertScope] || notification.alertScope;

                        const embed = new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('📢 알림')
                            .setDescription('설정하신 알림 조건에 도달했습니다!')
                            .addFields(
                                { name: '구분', value: scopeName, inline: true },
                                { name: '대상', value: subjectText, inline: true },
                                { name: '목표 손익', value: `${notification.targetPnL.toLocaleString()}원 ${directionText}`, inline: true },
                                { name: '현재 손익', value: `${Math.round(currentPnL).toLocaleString()}원`, inline: true },
                            )
                            .setTimestamp();

                        await discordUser.send({ embeds: [embed] });
                    } catch (dmErr) {
                        serverLog(`[WARN] Failed to send DM for notification ${notification._id}. userID: ${notification.userID}: ${dmErr}`);
                    }
                    await Notification.deleteOne({ _id: notification._id });
                } else {
                    const intervalMinutes = calculateCheckInterval(currentPnL, notification.targetPnL, notification.direction);
                    notification.nextCheckAt = new Date(Date.now() + intervalMinutes * 60 * 1000);
                    await notification.save();
                }
            } catch (innerErr) {
                serverLog(`[ERROR] Error processing notification ${notification._id}: ${innerErr}`);
            }
        }
    } catch (err) {
        serverLog(`[ERROR] Error in checkNotifications: ${err}`);
    }
}

function initNotificationScheduler() {
    serverLog('[INFO] Initializing notification scheduler...');
    schedule.scheduleJob('* * * * *', () => {
        checkNotifications();
    });
    serverLog('[INFO] Notification scheduler initialized');
    return true;
}

exports.setClientForNotifications = setClientForNotifications;
exports.initNotificationScheduler = initNotificationScheduler;
