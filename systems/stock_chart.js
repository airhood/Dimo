const axios = require('axios');
const fs = require('fs');
const { getStockName } = require('./stock_name');
const { COMPRESSION_RATE } = require('./stock_sim');

let chartFileIndex = 0;

// tickerList: string | string[]
// timeRangeData: 주식/선물/옵션 공통 포맷 — 각 ticker별 { ticker, prices[], compressed } 묶음
async function generateStockChartImage(tickerList, timeRangeData, targetMinuteIndex) {
    if (typeof tickerList === 'string') tickerList = [tickerList];

    const title = tickerList
        .map(t => `${getStockName(t)} [${t}]`)
        .join(' / ');

    const series = [];

    let time = 0;
    timeRangeData.forEach((hourData) => {
        hourData.forEach((priceData) => {
            const ticker = priceData.ticker;

            const data = priceData.prices.map((price) => {
                if (priceData.compressed) {
                    time += COMPRESSION_RATE;
                } else {
                    time += 1;
                }
                return [time, price];
            });

            const existingSeries = series.find(s => s.name === ticker);
            if (existingSeries) {
                existingSeries.data.push(...data);
            } else {
                series.push({ name: ticker, data });
            }
        });
    });

    if (series.length === 0 || series[0].data.length === 0) {
        throw new Error('No chart data available');
    }

    const finalTime = series[0].data[series[0].data.length - 1][0];

    const formattedSeries = series.map((s) => ({
        name: s.name,
        data: s.data.map(([t, p]) => [t - finalTime, p]),
    }));

    const chartOptions = {
        chart: { type: 'line' },
        title: { text: title },
        dataLabels: { enabled: false },
        stroke: { width: 2, curve: 'smooth' },
        series: formattedSeries,
        xaxis: {
            type: 'linear',
            title: { text: '시간 (분)' },
        },
        yaxis: {
            title: { text: '가격' },
        },
        legend: { show: formattedSeries.length > 1 },
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

exports.generateStockChartImage = generateStockChartImage;

// 단일 모드: generateIndexChartImage('DISDAQ', [[price,...], ...])
// 다중 모드: generateIndexChartImage([{name, timeRangeData}, ...])
async function generateIndexChartImage(nameOrList, timeRangeData) {
    let formattedSeries;
    let title;

    if (Array.isArray(nameOrList)) {
        // 다중 시리즈 모드
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
            // x축을 0 기준(현재)으로 정렬
            const finalT = data.length > 0 ? data[data.length - 1][0] : 0;
            return {
                name,
                data: data.map(([x, p]) => [x - finalT, p]),
            };
        });
    } else {
        // 단일 시리즈 모드 (기존 호환)
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

    const chartOptions = {
        chart: { type: 'line' },
        title: { text: title },
        dataLabels: { enabled: false },
        stroke: { width: 2, curve: 'smooth' },
        series: formattedSeries,
        xaxis: {
            type: 'linear',
            title: { text: '시간 (분)' },
        },
        yaxis: {
            title: { text: '가격' },
        },
        legend: { show: formattedSeries.length > 1 },
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
