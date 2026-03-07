'use strict';

const axios = require('axios');
const {
    getStockList,
    getStockTimeRangeData,
    getFutureTimeRangeData,
    getIndexTimeRangeData,
} = require('./stock_sim');
const { parseScript, Evaluator } = require('./auto_trade_interpreter');
const { INITIAL_BALANCE, SHORT_SELL_MARGIN_RATE } = require('../setting');

const BACKTEST_TIMEOUT_MS = 500;

// ── Data flattening helpers ────────────────────────────────────────────────────

/**
 * Flattens per-hour stock/future time-range data into a flat array of price snapshots.
 * Each snapshot is { [ticker]: price }.
 */
function flattenPriceData(timeRangeData) {
    const steps = [];
    for (const hourBucket of timeRangeData) {
        if (!hourBucket || hourBucket.length === 0) continue;
        const len = hourBucket[0]?.prices?.length ?? 0;
        for (let i = 0; i < len; i++) {
            const snapshot = {};
            for (const entry of hourBucket) {
                if (entry && entry.ticker && entry.prices) {
                    snapshot[entry.ticker] = entry.prices[i] ?? null;
                }
            }
            steps.push(snapshot);
        }
    }
    return steps;
}

/**
 * Flattens per-hour index time-range data (array of arrays) into a flat array of numbers.
 */
function flattenIndexData(indexTimeRangeData) {
    const steps = [];
    for (const hourBucket of indexTimeRangeData) {
        if (!Array.isArray(hourBucket)) continue;
        for (const price of hourBucket) {
            steps.push(price);
        }
    }
    return steps;
}

// ── Portfolio value calculation ────────────────────────────────────────────────

function calcPortfolioValue(portfolio, currentPrices) {
    let value = portfolio.cash;

    for (const s of portfolio.stocks) {
        const price = currentPrices.stocks[s.ticker] ?? s.purchasePrice;
        value += s.quantity * price;
    }

    // Short position value: margin refund minus cost to buy back
    // (cash was already adjusted at time of short: +proceeds - margin)
    for (const s of portfolio.shorts) {
        const price = currentPrices.stocks[s.ticker] ?? s.entryPrice;
        value += s.margin - price * s.quantity;
    }

    // Future position value: margin + unrealized PnL
    for (const f of portfolio.futures) {
        const price = currentPrices.futures[f.ticker] ?? currentPrices.stocks[f.ticker] ?? f.entryPrice;
        const pnl = (price - f.entryPrice) * f.quantity * f.leverage;
        value += f.margin + pnl;
    }

    // Options: use locked premium as approximation
    for (const o of portfolio.options) {
        value += o.totalPremium;
    }

    return Math.max(0, value);
}

// ── Virtual DB functions ───────────────────────────────────────────────────────

function makeVirtualDbFuncs(portfolio, getCurrentPrices) {
    return {
        getActiveAsset: async () => ({
            state: 'ok',
            data: {
                balance: portfolio.cash,
                stocks: portfolio.stocks.map((s) => ({ ticker: s.ticker, quantity: s.quantity })),
                stockShortSales: portfolio.shorts.map((s) => ({ ticker: s.ticker, quantity: s.quantity })),
                futures: portfolio.futures.map((f) => ({ ticker: f.ticker, quantity: f.quantity })),
                options: portfolio.options.map((o) => ({ ticker: o.ticker, optionType: o.type, quantity: o.quantity })),
                etfs: [],
                funds: [],
                loans: [],
            },
        }),

        stockBuy: async (_id, ticker, quantity) => {
            const prices = getCurrentPrices();
            const price = prices.stocks[ticker];
            if (!price) return { state: 'invalid_ticker', data: null };

            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / price);
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };

            const cost = price * quantity;
            if (portfolio.cash < cost) return { state: 'no_balance', data: null };

            portfolio.cash -= cost;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.stocks.push({ ticker, quantity, purchasePrice: price });
            return { state: 'success', data: quantity };
        },

        stockSell: async (_id, ticker, quantity) => {
            const prices = getCurrentPrices();
            const price = prices.stocks[ticker];
            if (!price) return { state: 'invalid_ticker', data: null };

            let totalOwned = 0;
            for (const s of portfolio.stocks) {
                if (s.ticker === ticker) totalOwned += s.quantity;
            }

            if (quantity > 0 && quantity < 1) {
                quantity = Math.floor(totalOwned * quantity);
                if (quantity === 0) return { state: 'no_stock', data: null };
            }

            if (quantity === 0) {
                if (totalOwned === 0) return { state: 'no_stock', data: null };
                quantity = totalOwned;
                portfolio.stocks = portfolio.stocks.filter((s) => s.ticker !== ticker);
            } else {
                quantity = Math.floor(quantity);
                let left = quantity;
                for (let i = 0; i < portfolio.stocks.length; i++) {
                    const s = portfolio.stocks[i];
                    if (s.ticker === ticker) {
                        if (s.quantity > left) {
                            s.quantity -= left;
                            left = 0;
                            break;
                        } else {
                            left -= s.quantity;
                            portfolio.stocks.splice(i, 1);
                            i--;
                        }
                    }
                }
                if (left > 0) return { state: 'no_stock', data: null };
            }

            portfolio.cash += price * quantity;
            portfolio.cash = Math.round(portfolio.cash);
            return { state: 'success', data: quantity };
        },

        stockShortSell: async (_id, ticker, quantity) => {
            const prices = getCurrentPrices();
            const price = prices.stocks[ticker];
            if (!price) return { state: 'invalid_ticker', data: null };

            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / (price * SHORT_SELL_MARGIN_RATE));
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };

            const margin = price * quantity * SHORT_SELL_MARGIN_RATE;
            let holdingMargin = 0;
            for (const s of portfolio.shorts) holdingMargin += s.margin;
            if (portfolio.cash < holdingMargin + margin) return { state: 'no_balance', data: null };

            portfolio.cash += price * quantity;
            portfolio.cash -= margin;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.shorts.push({ ticker, quantity, entryPrice: price, margin });
            return { state: 'success', data: quantity };
        },

        futureLong: async (_id, ticker, quantity, leverage) => {
            const prices = getCurrentPrices();
            const price = prices.futures[ticker] ?? prices.stocks[ticker];
            if (!price) return { state: 'invalid_ticker', data: null };

            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / price);
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };

            const margin = price * quantity;
            if (portfolio.cash < margin) return { state: 'no_balance', data: null };

            portfolio.cash -= margin;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.futures.push({ ticker, quantity, leverage, entryPrice: price, margin });
            return { state: 'success', data: quantity };
        },

        futureShort: async (_id, ticker, quantity, leverage) => {
            const prices = getCurrentPrices();
            const price = prices.futures[ticker] ?? prices.stocks[ticker];
            if (!price) return { state: 'invalid_ticker', data: null };

            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / price);
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };

            const margin = price * quantity;
            if (portfolio.cash < margin) return { state: 'no_balance', data: null };

            portfolio.cash -= margin;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.futures.push({ ticker, quantity: -quantity, leverage, entryPrice: price, margin });
            return { state: 'success', data: quantity };
        },

        futureLiquidate: async (_id, idx) => {
            const pos = portfolio.futures[idx - 1];
            if (!pos) return { state: 'invalid_position', data: null };

            const prices = getCurrentPrices();
            const currentPrice = prices.futures[pos.ticker] ?? prices.stocks[pos.ticker] ?? pos.entryPrice;
            const pnl = (currentPrice - pos.entryPrice) * pos.quantity * pos.leverage;

            portfolio.cash += pos.margin + pnl;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.futures.splice(idx - 1, 1);
            return { state: 'success', data: pos };
        },

        callOptionBuy: async (_id, ticker, quantity, strikePrice) => {
            const prices = getCurrentPrices();
            const stockPrice = prices.stocks[ticker] ?? 0;
            const premium = Math.max(1, Math.round(stockPrice * 0.02));
            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / premium);
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };
            const cost = premium * quantity;
            if (portfolio.cash < cost) return { state: 'no_balance', data: null };
            portfolio.cash -= cost;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.options.push({ ticker, type: 'call', quantity, strikePrice, entryPrice: stockPrice, totalPremium: cost });
            return { state: 'success', data: quantity };
        },

        putOptionBuy: async (_id, ticker, quantity, strikePrice) => {
            const prices = getCurrentPrices();
            const stockPrice = prices.stocks[ticker] ?? 0;
            const premium = Math.max(1, Math.round(stockPrice * 0.02));
            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / premium);
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };
            const cost = premium * quantity;
            if (portfolio.cash < cost) return { state: 'no_balance', data: null };
            portfolio.cash -= cost;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.options.push({ ticker, type: 'put', quantity, strikePrice, entryPrice: stockPrice, totalPremium: cost });
            return { state: 'success', data: quantity };
        },

        callOptionSell: async (_id, ticker, quantity, strikePrice) => {
            const prices = getCurrentPrices();
            const stockPrice = prices.stocks[ticker] ?? 0;
            const premium = Math.max(1, Math.round(stockPrice * 0.02));
            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / premium);
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };
            const cost = premium * quantity;
            if (portfolio.cash < cost) return { state: 'no_balance', data: null };
            portfolio.cash -= cost;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.options.push({ ticker, type: 'call', quantity: -quantity, strikePrice, entryPrice: stockPrice, totalPremium: -cost });
            return { state: 'success', data: quantity };
        },

        putOptionSell: async (_id, ticker, quantity, strikePrice) => {
            const prices = getCurrentPrices();
            const stockPrice = prices.stocks[ticker] ?? 0;
            const premium = Math.max(1, Math.round(stockPrice * 0.02));
            if (quantity >= 0 && quantity < 1) {
                const maxQty = Math.floor(portfolio.cash / premium);
                quantity = quantity === 0 ? maxQty : Math.floor(maxQty * quantity);
                if (quantity === 0) return { state: 'no_balance', data: null };
            }
            quantity = Math.floor(quantity);
            if (quantity <= 0) return { state: 'no_balance', data: null };
            const cost = premium * quantity;
            if (portfolio.cash < cost) return { state: 'no_balance', data: null };
            portfolio.cash -= cost;
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.options.push({ ticker, type: 'put', quantity: -quantity, strikePrice, entryPrice: stockPrice, totalPremium: -cost });
            return { state: 'success', data: quantity };
        },

        optionLiquidate: async (_id, idx) => {
            const pos = portfolio.options[idx - 1];
            if (!pos) return { state: 'invalid_position', data: null };
            portfolio.cash += Math.abs(pos.totalPremium);
            portfolio.cash = Math.round(portfolio.cash);
            portfolio.options.splice(idx - 1, 1);
            return { state: 'success', data: pos };
        },

        // Unsupported in backtest — log and no-op
        etfBuy:             async () => ({ state: '[미지원]', data: null }),
        etfSell:            async () => ({ state: '[미지원]', data: null }),
        loan:               async () => ({ state: '[미지원]', data: null }),
        loanRepay:          async () => ({ state: '[미지원]', data: null }),
        openFixedDeposit:   async () => ({ state: '[미지원]', data: null }),
        openSavingsAccount: async () => ({ state: '[미지원]', data: null }),
        investFund:         async () => ({ state: '[미지원]', data: null }),
        sellFundInvestment: async () => ({ state: '[미지원]', data: null }),
        addNotification:    async () => ({ state: '[미지원]', data: null }),
    };
}

// ── Chart generation ───────────────────────────────────────────────────────────

async function generateBalanceChart(balanceHistory, startBalance) {
    const MAX_POINTS = 200;
    let data = balanceHistory;

    if (data.length > MAX_POINTS) {
        const step = Math.ceil(data.length / MAX_POINTS);
        data = data.filter((_, i) => i % step === 0);
        const last = balanceHistory[balanceHistory.length - 1];
        if (data[data.length - 1] !== last) data.push(last);
    }

    // x축: 현재(마지막)를 0으로, 과거를 음수로 — stock_chart.js 와 동일한 정규화
    const finalIdx = data.length - 1;
    const series = data.map((v, i) => [i - finalIdx, Math.round(v)]);

    const chartConfig = {
        chart: { type: 'line' },
        title: { text: '자산 가치 변화' },
        dataLabels: { enabled: false },
        stroke: { width: 2, curve: 'smooth' },
        series: [{ name: '자산가치', data: series }],
        xaxis: { type: 'linear', tickAmount: 8, title: { text: '시간 (분)' } },
        yaxis: { title: { text: '가격' }, decimalsInFloat: 0 },
        legend: { show: false },
    };

    const response = await axios.post(
        'https://quickchart.io/apex-charts/render',
        { config: chartConfig, width: 700, height: 350 },
        { responseType: 'arraybuffer', timeout: 15000 },
    );

    return Buffer.from(response.data);
}

// ── Main backtest function ─────────────────────────────────────────────────────

/**
 * Runs a DimoScript backtest over historical price data.
 *
 * @param {string} script - DimoScript source
 * @param {{ hours: number, startBalance: number }} opts
 * @returns {Promise<{
 *   ok: boolean, error?: string,
 *   startBalance: number, finalValue: number,
 *   returnRate: number, mdd: number,
 *   tradeCount: number, successCount: number, failCount: number,
 *   trades: Array<{summary: string, success: boolean}>,
 *   logs: string[],
 *   chartBuffer: Buffer|null,
 * }>}
 */
async function runBacktest(script, { hours, startBalance = INITIAL_BALANCE }) {
    // 1. Parse AST once
    let ast;
    try {
        ast = parseScript(script);
    } catch (err) {
        return { ok: false, error: `파싱 오류: ${err.message}` };
    }

    // 2. Get all tickers
    const stockList = getStockList();
    if (!stockList || stockList.length === 0) {
        return { ok: false, error: '주가 데이터가 아직 초기화되지 않았습니다.' };
    }
    const allTickers = stockList.map((s) => s.ticker);

    // 3. Load historical price data
    const stockData  = getStockTimeRangeData(allTickers, hours, 0);
    const futureData = getFutureTimeRangeData(allTickers, hours, 0);
    const indexData  = getIndexTimeRangeData(hours, 0);

    // 4. Flatten into per-minute steps
    const stockSteps  = flattenPriceData(stockData);
    const futureSteps = flattenPriceData(futureData);
    const indexSteps  = flattenIndexData(indexData);

    if (stockSteps.length === 0) {
        return { ok: false, error: '충분한 가격 데이터가 없습니다. 시스템이 최소 1시간 이상 실행된 후 시도해주세요.' };
    }

    const minLen = indexSteps.length > 0
        ? Math.min(stockSteps.length, indexSteps.length)
        : stockSteps.length;

    // 5. Initialize virtual portfolio
    const portfolio = { cash: startBalance, stocks: [], shorts: [], futures: [], options: [] };

    let currentPrices = { stocks: {}, futures: {}, index: 0 };
    const getCurrentPrices = () => currentPrices;
    const dbFuncs = makeVirtualDbFuncs(portfolio, getCurrentPrices);

    // 6. Run simulation step by step
    const balanceHistory = [startBalance];
    const allLogs = [];
    const allTrades = [];
    let tradeCount = 0;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < minLen; i++) {
        currentPrices = {
            stocks:  stockSteps[i]  ?? {},
            futures: i < futureSteps.length ? (futureSteps[i] ?? {}) : {},
            index:   i < indexSteps.length  ? (indexSteps[i]  ?? 0)  : 0,
        };

        const priceFuncs = {
            getStockPrice:  (ticker) => currentPrices.stocks[ticker]  ?? null,
            getFuturePrice: (ticker) => currentPrices.futures[ticker] ?? null,
            getIndexPrice:  ()       => currentPrices.index,
            getEtfPrice:    ()       => null,
        };

        const evaluator = new Evaluator('backtest', '@self', dbFuncs, priceFuncs, null, BACKTEST_TIMEOUT_MS);

        try {
            await evaluator.evalProgram(ast);
        } catch (err) {
            // Non-fatal: script errors don't abort the simulation
            allLogs.push(`[오류] 스텝 ${i + 1}: ${err.message}`);
        }

        for (const log of evaluator.logs) allLogs.push(log);
        for (const trade of evaluator.trades) {
            allTrades.push(trade);
            tradeCount++;
            if (trade.success) successCount++;
            else failCount++;
        }

        balanceHistory.push(calcPortfolioValue(portfolio, currentPrices));
    }

    const finalValue = balanceHistory[balanceHistory.length - 1];
    const returnRate = ((finalValue - startBalance) / startBalance) * 100;

    // 7. Calculate MDD (Maximum Drawdown)
    let peak = startBalance;
    let mdd = 0;
    for (const v of balanceHistory) {
        if (v > peak) peak = v;
        const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
        if (dd > mdd) mdd = dd;
    }

    // 8. Generate balance chart
    let chartBuffer = null;
    try {
        chartBuffer = await generateBalanceChart(balanceHistory, startBalance);
    } catch (_) {
        // Chart failure is non-fatal
    }

    return {
        ok: true,
        startBalance,
        finalValue,
        returnRate,
        mdd,
        tradeCount,
        successCount,
        failCount,
        trades: allTrades.slice(-20),
        logs:   allLogs.slice(-30),
        chartBuffer,
    };
}

module.exports = { runBacktest };
