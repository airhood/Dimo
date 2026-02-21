const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');
const { getStockPrice, getFuturePrice, getOptionPrice } = require('./stock_sim');
const { getFundPrice } = require('./fund_price');
const { OPTION_UNIT_QUANTITY } = require('../setting');
const { EmbedBuilder } = require('discord.js');
const Notification = require('../schemas/notification');
const User = require('../schemas/user');
const Asset = require('../schemas/asset');

let discordClient = null;

function setClientForNotifications(client) {
    discordClient = client;
}

function calculatePnL(notification, userAsset) {
    const { type, ticker, strikePrice } = notification;

    if (type === 'stock') {
        const currentPrice = getStockPrice(ticker);
        if (currentPrice === null) return null;
        const holdings = userAsset.stocks.filter(s => s.ticker === ticker);
        return holdings.reduce((sum, h) => sum + (currentPrice - h.purchasePrice) * h.quantity, 0);
    }

    if (type === 'future') {
        const currentPrice = getFuturePrice(ticker);
        if (currentPrice === null) return null;
        const holdings = userAsset.futures.filter(f => f.ticker === ticker);
        return holdings.reduce((sum, h) => sum + (currentPrice - h.purchasePrice) * h.quantity * h.leverage, 0);
    }

    if (type === 'call_option') {
        const optionPrices = getOptionPrice(ticker);
        if (!optionPrices) return null;
        const currentPrice = optionPrices.call[strikePrice.toString()];
        if (currentPrice === undefined) return null;
        const holdings = userAsset.options.filter(
            o => o.ticker === ticker && o.optionType === 'call' && o.strikePrice === strikePrice
        );
        return holdings.reduce((sum, h) => sum + (currentPrice - h.purchasePrice) * h.quantity * OPTION_UNIT_QUANTITY, 0);
    }

    if (type === 'put_option') {
        const optionPrices = getOptionPrice(ticker);
        if (!optionPrices) return null;
        const currentPrice = optionPrices.put[strikePrice.toString()];
        if (currentPrice === undefined) return null;
        const holdings = userAsset.options.filter(
            o => o.ticker === ticker && o.optionType === 'put' && o.strikePrice === strikePrice
        );
        return holdings.reduce((sum, h) => sum + (currentPrice - h.purchasePrice) * h.quantity * OPTION_UNIT_QUANTITY, 0);
    }

    if (type === 'fund') {
        const currentUnitPrice = getFundPrice(ticker);
        if (currentUnitPrice === null) return null;
        const holdings = userAsset.funds.filter(f => f.name === ticker);
        return holdings.reduce((sum, h) => sum + (currentUnitPrice - h.purchasePrice) * h.unit, 0);
    }

    return null;
}

// Returns check interval in minutes based on how far current P&L is from target
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
                    // Price not available yet; retry in 1 minute
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
                        const typeNames = {
                            stock: '주식',
                            future: '선물',
                            call_option: '콜옵션',
                            put_option: '풋옵션',
                            fund: '펀드',
                        };
                        const directionText = notification.direction === 'above' ? '이상' : '이하';
                        const typeName = typeNames[notification.type] || notification.type;
                        const strikePriceText = notification.strikePrice
                            ? ` (행사가: ${notification.strikePrice.toLocaleString()}원)`
                            : '';

                        const embed = new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('📢 알림')
                            .setDescription(`<@${notification.userID}> 설정하신 알림 조건에 도달했습니다!`)
                            .addFields(
                                { name: '상품', value: `${typeName} - ${notification.ticker}${strikePriceText}`, inline: true },
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
