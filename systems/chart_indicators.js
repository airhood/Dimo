/**
 * 차트 보조지표 계산 모듈
 * 입력: prices[] — 종가(close) 배열 (숫자)
 */

function calcMA(prices, period) {
    const result = new Array(prices.length).fill(null);
    for (let i = period - 1; i < prices.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += prices[j];
        result[i] = sum / period;
    }
    return result;
}

function calcEMA(prices, period) {
    const result = new Array(prices.length).fill(null);
    const k = 2 / (period + 1);
    let started = false;
    let prev = 0;
    for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
            result[i] = null;
            continue;
        }
        if (!started) {
            // 첫 EMA는 SMA로 초기화
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += prices[j];
            prev = sum / period;
            result[i] = prev;
            started = true;
        } else {
            prev = prices[i] * k + prev * (1 - k);
            result[i] = prev;
        }
    }
    return result;
}

/**
 * RSI 계산 (Wilder's smoothing)
 * @returns {number[]} rsi[] — null for insufficient data points
 */
function calcRSI(prices, period = 14) {
    const result = new Array(prices.length).fill(null);
    if (prices.length < period + 1) return result;

    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gainSum += diff;
        else lossSum += Math.abs(diff);
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    const rsi = (ag, al) => (al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    result[period] = rsi(avgGain, avgLoss);

    for (let i = period + 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        result[i] = rsi(avgGain, avgLoss);
    }
    return result;
}

/**
 * MACD 계산
 * @returns {{ macd: number[], signal: number[] }}
 */
function calcMACD(prices, fast = 12, slow = 26, signal = 9) {
    const emaFast = calcEMA(prices, fast);
    const emaSlow = calcEMA(prices, slow);

    const macdLine = prices.map((_, i) =>
        emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
    );

    // signal은 macdLine의 EMA (null 제외하고 계산)
    const validMacd = macdLine.map(v => (v !== null ? v : 0));
    const signalLine = calcEMA(validMacd, signal);

    // null 처리: slow - 1 이전 인덱스는 null
    const firstValid = slow - 1;
    for (let i = 0; i < firstValid; i++) {
        macdLine[i] = null;
        signalLine[i] = null;
    }
    // signal EMA의 초기 부분도 null
    for (let i = firstValid; i < firstValid + signal - 1; i++) {
        signalLine[i] = null;
    }

    return { macd: macdLine, signal: signalLine };
}

/**
 * 볼린저 밴드 계산
 * @returns {{ upper: number[], middle: number[], lower: number[] }}
 */
function calcBB(prices, period = 20, mult = 2) {
    const middle = calcMA(prices, period);
    const upper = new Array(prices.length).fill(null);
    const lower = new Array(prices.length).fill(null);

    for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = middle[i];
        const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
        const std = Math.sqrt(variance);
        upper[i] = mean + mult * std;
        lower[i] = mean - mult * std;
    }
    return { upper, middle, lower };
}

/**
 * 이치모쿠 구름 계산
 * 종가 배열만 있으므로 고가/저가 근사: 구간 내 max/min
 * @returns {{ tenkan: number[], kijun: number[], spanA: number[], spanB: number[], chikou: number[] }}
 */
function calcIchimoku(prices) {
    const n = prices.length;
    const tenkan = new Array(n).fill(null);
    const kijun = new Array(n).fill(null);
    const spanA = new Array(n).fill(null);
    const spanB = new Array(n).fill(null);
    const chikou = new Array(n).fill(null);

    const midpoint = (arr, from, to) => {
        const slice = arr.slice(Math.max(0, from), to + 1);
        if (slice.length === 0) return null;
        return (Math.max(...slice) + Math.min(...slice)) / 2;
    };

    for (let i = 0; i < n; i++) {
        tenkan[i] = midpoint(prices, i - 8, i);
        kijun[i] = midpoint(prices, i - 25, i);

        if (tenkan[i] !== null && kijun[i] !== null) {
            spanA[i] = (tenkan[i] + kijun[i]) / 2;
        }
        spanB[i] = midpoint(prices, i - 51, i);

        // 치코우 스팬: 현재 종가를 26 기간 뒤에 표시
        if (i + 26 < n) chikou[i + 26] = prices[i];
    }

    return { tenkan, kijun, spanA, spanB, chikou };
}

module.exports = { calcMA, calcEMA, calcRSI, calcMACD, calcBB, calcIchimoku };
