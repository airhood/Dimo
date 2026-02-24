'use strict';

const schedule = require('node-schedule');
const { serverLog } = require('../server/server_logger');
const db = require('../database');
const Reservation = require('../schemas/reservation');
const { getStockPrice, getFuturePrice } = require('./stock_sim');
const { getEtfPrice } = require('./etf_system');
const User = require('../schemas/user');
const State = require('../schemas/state');

let discordClient = null;

function setClientForReservations(client) {
    discordClient = client;
}

async function withAccount(userId, accountKey, fn) {
    const user = await User.findOne({ userID: userId });
    if (!user) throw new Error(`사용자를 찾을 수 없습니다: ${userId}`);

    const stateDoc = await State.findById(user.state);
    if (!stateDoc) throw new Error(`상태 문서를 찾을 수 없습니다.`);

    const original = stateDoc.currentAccount;
    let result;
    try {
        stateDoc.currentAccount = accountKey;
        await stateDoc.save();
        result = await fn();
    } finally {
        stateDoc.currentAccount = original;
        await stateDoc.save();
    }
    return result;
}

function getCurrentPrice(reservation) {
    const { type, ticker } = reservation;
    if (type.startsWith('stock_') || type.startsWith('option_')) {
        return getStockPrice(ticker);
    }
    if (type.startsWith('future_')) {
        return getFuturePrice(ticker);
    }
    if (type.startsWith('etf_')) {
        return getEtfPrice(ticker);
    }
    return null;
}

async function executeReservation(reservation) {
    const { userId, accountKey, type, ticker, quantity, leverage, strikePrice } = reservation;
    return withAccount(userId, accountKey, async () => {
        switch (type) {
            case 'stock_buy':         return db.stockBuy(userId, ticker, quantity);
            case 'stock_sell':        return db.stockSell(userId, ticker, quantity);
            case 'future_long':       return db.futureLong(userId, ticker, quantity, leverage);
            case 'future_short':      return db.futureShort(userId, ticker, quantity, leverage);
            case 'option_call_buy':   return db.callOptionBuy(userId, ticker, quantity, strikePrice);
            case 'option_put_buy':    return db.putOptionBuy(userId, ticker, quantity, strikePrice);
            case 'option_call_sell':  return db.callOptionSell(userId, ticker, quantity, strikePrice);
            case 'option_put_sell':   return db.putOptionSell(userId, ticker, quantity, strikePrice);
            case 'etf_buy':           return db.etfBuy(userId, ticker, quantity);
            case 'etf_sell':          return db.etfSell(userId, ticker, quantity);
            default:                  return { state: 'error', data: null };
        }
    });
}

const TYPE_LABELS = {
    stock_buy: '주식 매수', stock_sell: '주식 매도',
    future_long: '선물 롱', future_short: '선물 숏',
    option_call_buy: '콜옵션 매수', option_put_buy: '풋옵션 매수',
    option_call_sell: '콜옵션 매도', option_put_sell: '풋옵션 매도',
    etf_buy: 'ETF 매수', etf_sell: 'ETF 매도',
};

function getUnit(type) {
    if (type.startsWith('future_') || type.startsWith('option_')) return '계약';
    if (type.startsWith('etf_')) return '좌';
    return '주';
}

async function checkReservations() {
    try {
        const pending = await Reservation.find({ status: 'pending' });
        for (const res of pending) {
            try {
                const price = getCurrentPrice(res);
                if (price === null || price === undefined) continue;

                const triggered =
                    (res.conditionType === 'above' && price >= res.conditionPrice) ||
                    (res.conditionType === 'below' && price <= res.conditionPrice);

                if (!triggered) continue;

                const result = await executeReservation(res);
                const now = new Date();

                if (result && result.state === 'success') {
                    res.status = 'executed';
                    res.executedAt = now;
                    serverLog(`[RESERVATION] Executed ${res._id} for ${res.userId}: ${res.type} ${res.ticker}`);

                    if (discordClient) {
                        try {
                            const user = await discordClient.users.fetch(res.userId);
                            const condLabel = res.conditionType === 'above' ? '이상' : '이하';
                            const typeLabel = TYPE_LABELS[res.type] ?? res.type;
                            const qtyStr = res.quantity != null ? ` ${res.quantity}${getUnit(res.type)}` : '';
                            await user.send(
                                `✅ **예약 체결**: ${typeLabel} \`${res.ticker}\`${qtyStr} ` +
                                `@ 현재가 **${Math.round(price).toLocaleString()}원** ` +
                                `(조건: ${res.conditionPrice.toLocaleString()}원 ${condLabel})`
                            );
                        } catch (_) { /* DM disabled or user unreachable */ }
                    }
                } else {
                    res.status = 'failed';
                    res.executedAt = now;
                    res.failReason = result?.state ?? '알 수 없는 오류';
                    serverLog(`[RESERVATION] Failed ${res._id} for ${res.userId}: ${res.failReason}`);

                    if (discordClient) {
                        try {
                            const user = await discordClient.users.fetch(res.userId);
                            const typeLabel = TYPE_LABELS[res.type] ?? res.type;
                            await user.send(
                                `❌ **예약 실패**: ${typeLabel} \`${res.ticker}\` — ${res.failReason}`
                            );
                        } catch (_) { /* DM disabled or user unreachable */ }
                    }
                }

                await res.save();
            } catch (err) {
                serverLog(`[RESERVATION] Error processing ${res._id}: ${err}`);
            }
        }
    } catch (err) {
        serverLog(`[RESERVATION] Failed to load reservations: ${err}`);
    }
}

function initReservationChecker() {
    schedule.scheduleJob('* * * * *', () => {
        checkReservations();
    });
    serverLog('[INFO] Reservation checker initialized');
    return true;
}

exports.setClientForReservations = setClientForReservations;
exports.initReservationChecker = initReservationChecker;
