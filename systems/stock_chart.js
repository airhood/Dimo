const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const { getStockName } = require('./stock_name');
const { COMPRESSION_RATE } = require('./stock_sim');
const { calcMA, calcRSI, calcMACD, calcBB, calcIchimoku } = require('./chart_indicators');

let chartFileIndex = 0;

// ─── internal helpers ─────────────────────────────────────────────────────────

/**
 * QuickChart ApexCharts API 호출 → Buffer 반환 (파일 저장 없음)
 */
async function renderChartBuffer(config, width, height) {
    const response = await axios.post('https://quickchart.io/apex-charts/render', {
        width,
        height,
        config,
    }, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}

/**
 * sharp로 버퍼 배열을 수직 합성 → Buffer 반환
 */
async function compositeVertical(buffers) {
    if (buffers.length === 1) return buffers[0];

    // 각 버퍼의 메타데이터 취득
    const metas = await Promise.all(buffers.map(b => sharp(b).metadata()));
    const totalWidth = metas[0].width;
    const totalHeight = metas.reduce((sum, m) => sum + m.height, 0);

    // 각 버퍼를 raw RGBA로 변환
    const raws = await Promise.all(buffers.map(b =>
        sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    ));

    // 수직으로 이어붙일 합성 이미지 base 생성
    let yOffset = 0;
    const compositeInputs = raws.map(({ data, info }) => {
        const input = {
            input: data,
            raw: { width: info.width, height: info.height, channels: 4 },
            top: yOffset,
            left: 0,
        };
        yOffset += info.height;
        return input;
    });

    return sharp({
        create: {
            width: totalWidth,
            height: totalHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
    })
        .composite(compositeInputs)
        .png()
        .toBuffer();
}

/**
 * N분봉 OHLC 파생
 * prices: [p0, p1, ...] (1분 단위)
 * interval: 몇 분봉인지
 * returns: [{ t, o, h, l, c }, ...]  t는 분 단위 절대 시간
 */
function buildCandles(prices, interval, startT) {
    const candles = [];
    for (let i = 0; i < prices.length; i += interval) {
        const slice = prices.slice(i, i + interval);
        if (slice.length === 0) continue;
        // interval=1 일 때 slice에 값이 하나뿐이라 o=h=l=c로 캔들이 납작해지는 문제 방지
        // 이전 가격을 시가로, 현재 가격을 종가로 사용
        const open = interval === 1
            ? (i > 0 ? prices[i - 1] : slice[0])
            : slice[0];
        const close = slice[slice.length - 1];
        candles.push({
            t: startT + i,
            o: open,
            h: Math.max(open, ...slice),
            l: Math.min(open, ...slice),
            c: close,
        });
    }
    return candles;
}

// ─── 메인 차트 함수 ────────────────────────────────────────────────────────────

/**
 * tickerList: string | string[]
 * timeRangeData: 주식/선물/옵션 공통 포맷
 * targetMinuteIndex: 시간 범위 (분 단위, x축 정규화에 사용)
 * settings: { chartType, candleInterval, indicators }
 */
async function generateStockChartImage(tickerList, timeRangeData, targetMinuteIndex, settings = {}) {
    if (typeof tickerList === 'string') tickerList = [tickerList];

    const chartType = settings.chartType ?? 'area';
    const candleInterval = settings.candleInterval ?? 5;
    const indicators = Array.isArray(settings.indicators) ? settings.indicators : [];

    const isCandle = chartType === 'candlestick';
    const isMulti = tickerList.length > 1;

    // 캔들 + 다중 종목 조합 금지
    if (isCandle && isMulti) {
        throw new Error('CANDLE_MULTI_NOT_ALLOWED');
    }

    const title = tickerList
        .map(t => `${getStockName(t)} [${t}]`)
        .join(' / ');

    // ── 티커별 가격 시퀀스 수집 ───────────────────────────────────────────────
    const seriesMap = {};
    timeRangeData.forEach((hourData) => {
        hourData.forEach(({ ticker, prices, compressed }) => {
            if (!seriesMap[ticker]) seriesMap[ticker] = [];
            seriesMap[ticker].push({ prices, compressed });
        });
    });

    // 티커별 flat price 배열 (절대 t)
    const rawSeriesMap = {};
    Object.entries(seriesMap).forEach(([ticker, hourEntries]) => {
        let t = 0;
        const pts = [];
        hourEntries.forEach(({ prices, compressed }) => {
            prices.forEach((price) => {
                t += compressed ? COMPRESSION_RATE : 1;
                pts.push({ t, price });
            });
        });
        rawSeriesMap[ticker] = pts;
    });

    if (Object.keys(rawSeriesMap).length === 0) {
        throw new Error('No chart data available');
    }

    // ── x축 정규화: finalT를 0으로 ───────────────────────────────────────────
    const normalizeT = (pts) => {
        if (pts.length === 0) return [];
        const finalT = pts[pts.length - 1].t;
        return pts.map(({ t, price }) => ({ t: t - finalT, price }));
    };

    // ── 다중 종목 지표 비활성화 ───────────────────────────────────────────────
    const activeIndicators = isMulti ? [] : indicators;
    const hasRSI = activeIndicators.includes('RSI');
    const hasMACD = activeIndicators.includes('MACD');
    const hasBB = activeIndicators.includes('볼린저밴드');
    const hasMA = activeIndicators.includes('이동평균선');
    const hasIchimoku = activeIndicators.includes('이치모쿠');
    const hasIchimokuCloud = activeIndicators.includes('이치모쿠구름');

    const mainHeight = 350;

    // ── 패널용 prices 배열 (단일 종목 종가) ──────────────────────────────────
    let closePrices = [];
    let normalizedPts = [];
    if (!isMulti) {
        const ticker = tickerList[0];
        normalizedPts = normalizeT(rawSeriesMap[ticker] ?? []);
        closePrices = normalizedPts.map(p => p.price);
    }

    // ── 메인 차트 series 구성 ─────────────────────────────────────────────────
    let mainSeries = [];

    if (isCandle) {
        // 캔들 시리즈 (단일 종목만)
        const ticker = tickerList[0];
        const pts = rawSeriesMap[ticker] ?? [];
        const finalT = pts.length > 0 ? pts[pts.length - 1].t : 0;
        const flatPrices = pts.map(p => p.price);
        const candles = buildCandles(flatPrices, candleInterval, pts.length > 0 ? pts[0].t - finalT : 0);

        mainSeries.push({
            name: ticker,
            type: 'candlestick',
            data: candles.map(c => ({ x: c.t, y: [c.o, c.h, c.l, c.c] })),
        });

        // 캔들 오버레이: 캔들 데이터가 {x,y} 객체 형식이므로 라인도 동일하게 맞춤
        const toXY = (tArr, vals) =>
            tArr.map((t, i) => vals[i] !== null ? { x: t, y: vals[i] } : null).filter(Boolean);

        // 오버레이 — MA (캔들 종가 기준)
        if (hasMA) {
            const candleClose = candles.map(c => c.c);
            const candleT = candles.map(c => c.t);
            const ma5 = calcMA(candleClose, 5);
            const ma20 = calcMA(candleClose, 20);
            mainSeries.push({ name: 'MA5',  type: 'line', data: toXY(candleT, ma5) });
            mainSeries.push({ name: 'MA20', type: 'line', data: toXY(candleT, ma20) });
        }

        // 볼린저 밴드 오버레이
        if (hasBB) {
            const candleClose = candles.map(c => c.c);
            const candleT = candles.map(c => c.t);
            const bb = calcBB(candleClose, 20, 2);
            mainSeries.push({ name: 'BB Upper',  type: 'line', data: toXY(candleT, bb.upper) });
            mainSeries.push({ name: 'BB Middle', type: 'line', data: toXY(candleT, bb.middle) });
            mainSeries.push({ name: 'BB Lower',  type: 'line', data: toXY(candleT, bb.lower) });
        }

        // 이치모쿠 오버레이
        if (hasIchimoku) {
            const candleClose = candles.map(c => c.c);
            const candleT = candles.map(c => c.t);
            const ich = calcIchimoku(candleClose);
            for (const { name, data } of [
                { name: '전환선',    data: ich.tenkan },
                { name: '기준선',    data: ich.kijun },
                { name: '선행스팬A', data: ich.spanA },
                { name: '선행스팬B', data: ich.spanB },
                { name: '후행스팬',  data: ich.chikou },
            ]) {
                mainSeries.push({ name, type: 'line', data: toXY(candleT, data) });
            }
            const ichBullish = candleT
                .map((t, i) => {
                    const a = ich.spanA[i], b = ich.spanB[i];
                    if (a === null || b === null) return null;
                    return { x: t, y: a >= b ? [b, a] : [Math.min(a, b), Math.min(a, b)] };
                })
                .filter(Boolean);
            const ichBearish = candleT
                .map((t, i) => {
                    const a = ich.spanA[i], b = ich.spanB[i];
                    if (a === null || b === null) return null;
                    return { x: t, y: a < b ? [a, b] : [Math.min(a, b), Math.min(a, b)] };
                })
                .filter(Boolean);
            mainSeries.push({ name: '구름(상승)', type: 'rangeArea', data: ichBullish });
            mainSeries.push({ name: '구름(하락)', type: 'rangeArea', data: ichBearish });
        }

        // 이치모쿠 구름 오버레이 (선행스팬A/B 라인 + 구름 채움)
        if (hasIchimokuCloud) {
            const candleClose = candles.map(c => c.c);
            const candleT = candles.map(c => c.t);
            const ich = calcIchimoku(candleClose);
            mainSeries.push({ name: '선행스팬A', type: 'line', data: toXY(candleT, ich.spanA) });
            mainSeries.push({ name: '선행스팬B', type: 'line', data: toXY(candleT, ich.spanB) });
            const bullishCloud = candleT
                .map((t, i) => {
                    const a = ich.spanA[i], b = ich.spanB[i];
                    if (a === null || b === null) return null;
                    return { x: t, y: a >= b ? [b, a] : [Math.min(a, b), Math.min(a, b)] };
                })
                .filter(Boolean);
            const bearishCloud = candleT
                .map((t, i) => {
                    const a = ich.spanA[i], b = ich.spanB[i];
                    if (a === null || b === null) return null;
                    return { x: t, y: a < b ? [a, b] : [Math.min(a, b), Math.min(a, b)] };
                })
                .filter(Boolean);
            mainSeries.push({ name: '구름(상승)', type: 'rangeArea', data: bullishCloud });
            mainSeries.push({ name: '구름(하락)', type: 'rangeArea', data: bearishCloud });
        }
    } else {
        // Area 시리즈 (멀티 가능)
        tickerList.forEach((ticker) => {
            const pts = normalizeT(rawSeriesMap[ticker] ?? []);
            mainSeries.push({
                name: ticker,
                data: pts.map(p => [p.t, p.price]),
            });
        });

        // 오버레이 지표 (단일 종목일 때만)
        if (!isMulti) {
            const tPoints = normalizedPts;
            const tArr = tPoints.map(p => p.t);

            if (hasMA) {
                const ma5 = calcMA(closePrices, 5);
                const ma20 = calcMA(closePrices, 20);
                mainSeries.push({
                    name: 'MA5',
                    type: 'line',
                    data: tArr.map((t, i) => ma5[i] !== null ? [t, ma5[i]] : null).filter(Boolean),
                });
                mainSeries.push({
                    name: 'MA20',
                    type: 'line',
                    data: tArr.map((t, i) => ma20[i] !== null ? [t, ma20[i]] : null).filter(Boolean),
                });
            }

            if (hasBB) {
                const bb = calcBB(closePrices, 20, 2);
                const tArr2 = tPoints.map(p => p.t);
                mainSeries.push({
                    name: 'BB Upper',
                    type: 'line',
                    data: tArr2.map((t, i) => bb.upper[i] !== null ? [t, bb.upper[i]] : null).filter(Boolean),
                });
                mainSeries.push({
                    name: 'BB Middle',
                    type: 'line',
                    data: tArr2.map((t, i) => bb.middle[i] !== null ? [t, bb.middle[i]] : null).filter(Boolean),
                });
                mainSeries.push({
                    name: 'BB Lower',
                    type: 'line',
                    data: tArr2.map((t, i) => bb.lower[i] !== null ? [t, bb.lower[i]] : null).filter(Boolean),
                });
            }

            if (hasIchimoku) {
                const ich = calcIchimoku(closePrices);
                const tArr2 = tPoints.map(p => p.t);
                const ichSeries = [
                    { name: '전환선', data: ich.tenkan },
                    { name: '기준선', data: ich.kijun },
                    { name: '선행스팬A', data: ich.spanA },
                    { name: '선행스팬B', data: ich.spanB },
                    { name: '후행스팬', data: ich.chikou },
                ];
                for (const s of ichSeries) {
                    mainSeries.push({
                        name: s.name,
                        type: 'line',
                        data: tArr2.map((t, i) => s.data[i] !== null ? [t, s.data[i]] : null).filter(Boolean),
                    });
                }
                const bullishCloud5 = tArr2
                    .map((t, i) => {
                        const a = ich.spanA[i], b = ich.spanB[i];
                        if (a === null || b === null) return null;
                        return { x: t, y: a >= b ? [b, a] : [Math.min(a, b), Math.min(a, b)] };
                    })
                    .filter(Boolean);
                const bearishCloud5 = tArr2
                    .map((t, i) => {
                        const a = ich.spanA[i], b = ich.spanB[i];
                        if (a === null || b === null) return null;
                        return { x: t, y: a < b ? [a, b] : [Math.min(a, b), Math.min(a, b)] };
                    })
                    .filter(Boolean);
                mainSeries.push({ name: '구름(상승)', type: 'rangeArea', color: '#A5D6A7', data: bullishCloud5 });
                mainSeries.push({ name: '구름(하락)', type: 'rangeArea', color: '#EF9A9A', data: bearishCloud5 });
            }

            // 이치모쿠 구름 오버레이 (선행스팬A/B 라인 + 구름 채움)
            if (hasIchimokuCloud) {
                const ich = calcIchimoku(closePrices);
                const tArr2 = tPoints.map(p => p.t);
                mainSeries.push({
                    name: '선행스팬A',
                    type: 'line',
                    color: '#43A047',
                    data: tArr2.map((t, i) => ich.spanA[i] !== null ? [t, ich.spanA[i]] : null).filter(Boolean),
                });
                mainSeries.push({
                    name: '선행스팬B',
                    type: 'line',
                    color: '#EF5350',
                    data: tArr2.map((t, i) => ich.spanB[i] !== null ? [t, ich.spanB[i]] : null).filter(Boolean),
                });
                const bullishCloud = tArr2
                    .map((t, i) => {
                        const a = ich.spanA[i], b = ich.spanB[i];
                        if (a === null || b === null) return null;
                        return { x: t, y: a >= b ? [b, a] : [Math.min(a, b), Math.min(a, b)] };
                    })
                    .filter(Boolean);
                const bearishCloud = tArr2
                    .map((t, i) => {
                        const a = ich.spanA[i], b = ich.spanB[i];
                        if (a === null || b === null) return null;
                        return { x: t, y: a < b ? [a, b] : [Math.min(a, b), Math.min(a, b)] };
                    })
                    .filter(Boolean);
                mainSeries.push({ name: '구름(상승)', type: 'rangeArea', color: '#A5D6A7', data: bullishCloud });
                mainSeries.push({ name: '구름(하락)', type: 'rangeArea', color: '#EF9A9A', data: bearishCloud });
            }
        }
    }

    // ── 메인 차트 config ──────────────────────────────────────────────────────
    const hasOverlay = mainSeries.length > 1;
    const overlayCount = mainSeries.length - 1;

    // 오버레이가 있을 때만 per-series opacity 배열 적용
    // 캔들차트에 stroke/fill 배열을 무조건 주면 몸통이 투명해지거나 수염이 사라짐
    const candleConfig = {
        chart: { type: 'candlestick' },
        title: { text: title },
        dataLabels: { enabled: false },
        plotOptions: {
            candlestick: {
                colors: {
                    upward: '#FF6B6B',   // 상승: 파스텔 빨강
                    downward: '#6B8CFF', // 하락: 파스텔 파랑
                },
            },
        },
        series: mainSeries,
        xaxis: { type: 'linear', tickAmount: 8, title: { text: '시간 (분)' } },
        yaxis: { title: { text: '가격' }, decimalsInFloat: 0 },
        legend: { show: hasOverlay },
    };
    // 오버레이가 있을 때 stroke width 배열 + 명시적 색상 지정
    // stroke.opacity 배열은 QuickChart ApexCharts 버전에서 렌더링 오류를 일으킴 — 사용 금지
    if (hasOverlay) {
        // 지표별 고정 색상/선폭 (series 순서에 맞게 구성)
        const overlayColors = [];
        const overlayStrokeWidths = [];
        if (hasMA) {
            overlayColors.push('#FF8C00', '#1E90FF');                                    // MA5, MA20
            overlayStrokeWidths.push(1.5, 1.5);
        }
        if (hasBB) {
            overlayColors.push('#E74C3C', '#7F8C8D', '#E74C3C');                         // Upper, Middle, Lower
            overlayStrokeWidths.push(1.5, 1.5, 1.5);
        }
        if (hasIchimoku) {
            overlayColors.push('#E53935', '#1565C0', '#43A047', '#FB8C00', '#8E24AA',   // 전환, 기준, 선행A, 선행B, 후행
                               '#A5D6A7', '#EF9A9A');                                   // 구름(상승=연초록), 구름(하락=연빨강)
            overlayStrokeWidths.push(1.5, 1.5, 1.5, 1.5, 1.5, 0, 0);
        }
        if (hasIchimokuCloud) {
            overlayColors.push('#43A047', '#EF5350', '#A5D6A7', '#EF9A9A');              // 선행A(초록), 선행B(빨강), 구름(상승=연초록), 구름(하락=연빨강)
            overlayStrokeWidths.push(1.5, 1.5, 0, 0);                                   // 구름 rangeArea는 테두리 없음
        }

        candleConfig.colors = ['#546E7A', ...overlayColors];
        candleConfig.stroke = { width: [1, ...overlayStrokeWidths] };
    }

    const overlayStrokeOps = [];
    const overlayFillOps   = [];
    if (hasMA)           { overlayStrokeOps.push(0.55, 0.55);                  overlayFillOps.push(0, 0); }
    if (hasBB)           { overlayStrokeOps.push(0.55, 0.55, 0.55);            overlayFillOps.push(0, 0, 0); }
    if (hasIchimoku)     { overlayStrokeOps.push(0.55, 0.55, 0.55, 0.55, 0.55, 0, 0); overlayFillOps.push(0, 0, 0, 0, 0, 1, 1); }
    if (hasIchimokuCloud){ overlayStrokeOps.push(0.55, 0.55, 0, 0);                  overlayFillOps.push(0, 0, 1, 1); }
    const areaStrokeOpacities = [1, ...overlayStrokeOps];
    const areaFillOpacities   = [(isMulti ? 0.1 : 0.3), ...overlayFillOps];

    const mainConfig = isCandle
        ? candleConfig
        : {
            chart: { type: 'area' },
            title: { text: title },
            dataLabels: { enabled: false },
            stroke: { width: 2, curve: 'smooth', opacity: areaStrokeOpacities },
            fill:   { opacity: areaFillOpacities },
            series: mainSeries,
            xaxis: { type: 'linear', tickAmount: 8, title: { text: '시간 (분)' } },
            yaxis: { title: { text: '가격' }, decimalsInFloat: 0 },
            legend: { show: isMulti || hasOverlay },
        };

    // ── 패널 config 생성 ──────────────────────────────────────────────────────
    const panelConfigs = [];

    if (hasRSI && closePrices.length > 0) {
        const tArr = normalizedPts.map(p => p.t);
        const rsi = calcRSI(closePrices, 14);
        panelConfigs.push({
            label: 'RSI (14)',
            config: {
                chart: { type: 'line' },
                title: { text: 'RSI (14)' },
                dataLabels: { enabled: false },
                stroke: { width: 2, curve: 'smooth' },
                series: [{
                    name: 'RSI',
                    data: tArr.map((t, i) => rsi[i] !== null ? [t, rsi[i]] : null).filter(Boolean),
                }],
                xaxis: { type: 'linear', tickAmount: 8, title: { text: '시간 (분)' } },
                yaxis: { min: 0, max: 100, title: { text: 'RSI' }, decimalsInFloat: 1 },
                annotations: {
                    yaxis: [
                        { y: 70, borderColor: '#FF0000', label: { text: '과매수' } },
                        { y: 30, borderColor: '#0000FF', label: { text: '과매도' } },
                    ],
                },
            },
        });
    }

    if (hasMACD && closePrices.length > 0) {
        const tArr = normalizedPts.map(p => p.t);
        const { macd, signal } = calcMACD(closePrices, 12, 26, 9);
        panelConfigs.push({
            label: 'MACD (12,26,9)',
            config: {
                chart: { type: 'line' },
                title: { text: 'MACD (12,26,9)' },
                dataLabels: { enabled: false },
                stroke: { width: 2, curve: 'smooth' },
                series: [
                    {
                        name: 'MACD',
                        data: tArr.map((t, i) => macd[i] !== null ? [t, macd[i]] : null).filter(Boolean),
                    },
                    {
                        name: 'Signal',
                        data: tArr.map((t, i) => signal[i] !== null ? [t, signal[i]] : null).filter(Boolean),
                    },
                ],
                xaxis: { type: 'linear', tickAmount: 8, title: { text: '시간 (분)' } },
                yaxis: { title: { text: 'MACD' }, decimalsInFloat: 2 },
                legend: { show: true },
            },
        });
    }

    // ── 렌더링 ────────────────────────────────────────────────────────────────
    const results = [];

    const mainBuffer = await renderChartBuffer(mainConfig, 700, mainHeight);
    const mainFilepath = `assets/charts/chart_${chartFileIndex}.png`;
    const mainFilename = `chart_${chartFileIndex}.png`;
    fs.writeFileSync(mainFilepath, mainBuffer);
    chartFileIndex++;
    results.push({ filepath: mainFilepath, filename: mainFilename, label: 'main' });

    for (const { config, label } of panelConfigs) {
        const panelBuffer = await renderChartBuffer(config, 700, 180);
        const panelFilepath = `assets/charts/chart_${chartFileIndex}.png`;
        const panelFilename = `chart_${chartFileIndex}.png`;
        fs.writeFileSync(panelFilepath, panelBuffer);
        chartFileIndex++;
        results.push({ filepath: panelFilepath, filename: panelFilename, label });
    }

    return results;
}

exports.generateStockChartImage = generateStockChartImage;

// ─── 지수 차트 (기존 로직 유지) ───────────────────────────────────────────────

async function generateIndexChartImage(nameOrList, timeRangeData) {
    let formattedSeries;
    let title;

    if (Array.isArray(nameOrList)) {
        title = nameOrList.map(s => s.name).join(' / ');
        formattedSeries = nameOrList.map(({ name, timeRangeData: trd }) => {
            let t = 0;
            const data = [];
            trd.forEach((hourPrices) => {
                hourPrices.forEach((price) => {
                    data.push([t, price]);
                    t += 1;
                });
            });
            const finalT = data.length > 0 ? data[data.length - 1][0] : 0;
            return {
                name,
                data: data.map(([x, p]) => [x - finalT, p]),
            };
        });
    } else {
        title = nameOrList;
        let t = 0;
        const data = [];
        timeRangeData.forEach((hourPrices) => {
            hourPrices.forEach((price) => {
                data.push([t, price]);
                t += 1;
            });
        });
        if (data.length === 0) throw new Error('No index data available');
        const finalT = data[data.length - 1][0];
        formattedSeries = [{
            name: nameOrList,
            data: data.map(([x, p]) => [x - finalT, p]),
        }];
    }

    const isMulti = formattedSeries.length > 1;
    const chartOptions = {
        chart: { type: 'area' },
        title: { text: title },
        dataLabels: { enabled: false },
        stroke: { width: 2, curve: 'smooth' },
        fill: { opacity: isMulti ? 0.1 : 0.3 },
        series: formattedSeries,
        xaxis: { type: 'linear', tickAmount: 8, title: { text: '시간 (분)' } },
        yaxis: { title: { text: '가격' }, decimalsInFloat: 0 },
        legend: { show: isMulti },
    };

    const response = await axios.post('https://quickchart.io/apex-charts/render', {
        width: 700,
        height: 350,
        config: chartOptions,
    }, { responseType: 'arraybuffer' });

    const filepath = `assets/charts/chart_${chartFileIndex}.png`;
    const filename = `chart_${chartFileIndex}.png`;
    fs.writeFileSync(filepath, response.data);
    chartFileIndex++;
    return { filepath, filename };
}

exports.generateIndexChartImage = generateIndexChartImage;
