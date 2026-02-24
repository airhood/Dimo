const schedule = require('node-schedule');
const { EmbedBuilder } = require('discord.js');
const { serverLog } = require('../server/server_logger');
const { getStockPrice, getFuturePrice } = require('./stock_sim');
const Asset = require('../schemas/asset');
const User = require('../schemas/user');

let discordClient = null;

function setClientForMarginCall(client) {
    discordClient = client;
}

// ── 강제청산 조건 확인 ────────────────────────────────────────────────────────

// 선물 P&L: quantity > 0 = 롱, quantity < 0 = 숏
function getFuturePnL(position, currentPrice) {
    return (currentPrice - position.purchasePrice) * position.quantity * position.leverage;
}

// 공매도 손실 (양수면 손실)
function getShortSaleLoss(short, currentPrice) {
    return (currentPrice - short.sellPrice) * short.quantity;
}

// ── 강제청산 실행 ─────────────────────────────────────────────────────────────

async function checkAllPositions() {
    if (!discordClient) return;

    try {
        // 선물 또는 공매도 포지션이 있는 자산만 조회
        const assets = await Asset.find({
            $or: [
                { 'futures.0': { $exists: true } },
                { 'stockShortSales.0': { $exists: true } },
            ],
        });

        for (const userAsset of assets) {
            const liquidated = [];

            // ── 선물 강제청산 ────────────────────────────────────────────────
            for (let i = userAsset.futures.length - 1; i >= 0; i--) {
                const pos = userAsset.futures[i];
                const currentPrice = getFuturePrice(pos.ticker);
                if (currentPrice === null) continue;

                const pnl = getFuturePnL(pos, currentPrice);
                if (pnl > -pos.margin) continue; // 청산 조건 미충족

                // 환급액: pnl + margin, 0 미만이면 0 (마진 이상 손실 방지)
                const payout = Math.max(pnl + pos.margin, 0);
                userAsset.balance += payout;

                liquidated.push({
                    type: 'future',
                    ticker: pos.ticker,
                    quantity: pos.quantity,
                    leverage: pos.leverage,
                    pnl: pnl,
                    margin: pos.margin,
                });

                userAsset.futures.splice(i, 1);
            }

            // ── 공매도 강제청산 ──────────────────────────────────────────────
            for (let i = userAsset.stockShortSales.length - 1; i >= 0; i--) {
                const short = userAsset.stockShortSales[i];
                const currentPrice = getStockPrice(short.ticker);
                if (currentPrice === null) continue;

                const loss = getShortSaleLoss(short, currentPrice);
                if (loss < short.margin) continue; // 청산 조건 미충족

                // 강제청산 정산:
                //   공매도 시 balance += sellPrice*Q, balance -= margin
                //   강제청산 시 balance += margin - currentPrice*Q (매수 상환)
                //   단, 손실이 margin을 초과해도 최대 손실은 margin으로 제한
                const netAdjustment = Math.max(short.margin - currentPrice * short.quantity, -short.margin);
                userAsset.balance += netAdjustment;

                liquidated.push({
                    type: 'short',
                    ticker: short.ticker,
                    quantity: short.quantity,
                    uid: short.uid,
                    loss: loss,
                    margin: short.margin,
                });

                userAsset.stockShortSales.splice(i, 1);
            }

            if (liquidated.length === 0) continue;

            userAsset.balance = Math.round(userAsset.balance);
            await userAsset.save();

            // 트랜잭션 스케줄 정리
            const user = await User.findOne({ asset: userAsset._id });
            if (!user) continue;

            const { deleteTransactionSchedule, addTransactionLog } = require('../database');

            // 선물 스케줄: futures가 없어졌으면 삭제
            const hadFutureLiquidated = liquidated.some(p => p.type === 'future');
            if (hadFutureLiquidated && userAsset.futures.length === 0) {
                await deleteTransactionSchedule(`${user.userID}_future`);
            }

            // 공매도 스케줄: 해당 uid별 삭제
            for (const pos of liquidated) {
                if (pos.type === 'short' && pos.uid !== undefined) {
                    await deleteTransactionSchedule(`${user.userID}-short_${pos.uid}`);
                }
            }

            // 트랜잭션 로그 기록
            for (const pos of liquidated) {
                if (pos.type === 'future') {
                    const direction = pos.quantity > 0 ? '롱' : '숏';
                    addTransactionLog(user.userID, 'future_liquidate',
                        `${pos.ticker} 선물 강제청산 (${direction} ${pos.leverage}배, 손익 ${Math.round(pos.pnl).toLocaleString()}원)`);
                } else {
                    addTransactionLog(user.userID, 'stock_short_repay',
                        `${pos.ticker} 공매도 강제청산 (손실 ${Math.round(pos.loss).toLocaleString()}원)`);
                }
            }

            serverLog(`[INFO] Force-liquidated ${liquidated.length} position(s) for user ${user.userID}`);

            // DM 발송
            try {
                const discordUser = await discordClient.users.fetch(user.userID);
                for (const pos of liquidated) {
                    let embed;
                    if (pos.type === 'future') {
                        const direction = pos.quantity > 0 ? '롱' : '숏';
                        embed = new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('⚠️ 강제청산')
                            .setDescription('증거금 전액 손실로 인해 선물 포지션이 강제청산되었습니다.')
                            .addFields(
                                { name: '종목', value: `${pos.ticker} (${direction} ${pos.leverage}배)`, inline: true },
                                { name: '수량', value: `${Math.abs(pos.quantity)}계약`, inline: true },
                                { name: '손익', value: `${Math.round(pos.pnl).toLocaleString()}원`, inline: true },
                                { name: '증거금', value: `${pos.margin.toLocaleString()}원`, inline: true },
                            )
                            .setTimestamp();
                    } else {
                        embed = new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('⚠️ 강제청산')
                            .setDescription('증거금 전액 손실로 인해 공매도 포지션이 강제청산되었습니다.')
                            .addFields(
                                { name: '종목', value: pos.ticker, inline: true },
                                { name: '수량', value: `${pos.quantity}주`, inline: true },
                                { name: '손실', value: `${Math.round(pos.loss).toLocaleString()}원`, inline: true },
                                { name: '증거금', value: `${pos.margin.toLocaleString()}원`, inline: true },
                            )
                            .setTimestamp();
                    }
                    await discordUser.send({ embeds: [embed] });
                }
            } catch (dmErr) {
                serverLog(`[WARN] Failed to send forced liquidation DM to user ${user.userID}: ${dmErr}`);
            }
        }
    } catch (err) {
        serverLog(`[ERROR] Error in checkAllPositions (margin call checker): ${err}`);
    }
}

// ── 스케줄러 초기화 ───────────────────────────────────────────────────────────

function initMarginCallChecker() {
    schedule.scheduleJob('*/5 * * * *', () => {
        checkAllPositions();
    });
    serverLog('[INFO] Margin call checker initialized');
    return true;
}

exports.setClientForMarginCall = setClientForMarginCall;
exports.initMarginCallChecker = initMarginCallChecker;
