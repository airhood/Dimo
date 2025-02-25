const axios = require('axios');
const fs = require('fs');
const { getStockName } = require('./stock_name');
const { COMPRESSION_RATE } = require('./stock_sim');

let chartFileIndex = 0;

async function generateStockChartImage(ticker, timeRangeData, targetMinuteIndex) {
    const name = getStockName(ticker);

    const series = [];

    const maxHourIndex = timeRangeData.length - 1;
    const maxMinuteIndex = timeRangeData[maxHourIndex][0].prices.length - 1;
    const currentTime = (maxHourIndex * 60) + maxMinuteIndex;
    
    let time = 0;
    timeRangeData.forEach((hourData, hour) => {
        hourData.forEach((priceData) => {
            const ticker = priceData.ticker;

            const data = priceData.prices.map((price, minute) => {
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
                series.push({
                    name: ticker,
                    data: data,
                });
            }
        });
    });

    const finalTime = series[0].data[series[0].data.length - 1][0];

    const formattedSeries = series.map((stock_series) => {
        return {
            name: stock_series.ticker,
            data: stock_series.data.map((value) => {
                return [
                    value[0] - finalTime,
                    value[1]
                ];
            }),
        };
    });

    const chartOptions = {
        chart: {
            type: 'area',
        },
        title: {
            text: `${name} [${ticker}]`,
        },
        dataLabels: {
            enabled: false,
        },
        stroke: {
            width: 1,
        },
        series: formattedSeries,
        xaxis: {
            type: 'linear',
            title: {
                text: '시간 (분)'
            },
            tickInterval: () => {
                if (timeMax <= 60 + 20) return 10;
                else if (timeMax <= 120 + 40) return 20;
                else if (timeMax <= 180 + 60) return 30;
            }
        },
        yaxis: {
            title: {
                text: '가격',
            },
        },
    };
    
    const response = await axios.post('https://quickchart.io/apex-charts/render', {
        width: 600,
        height: 300,
        config: chartOptions,
    }, {
        responseType: 'arraybuffer'
    });

    // fs.writeFileSync('test_s.txt', JSON.stringify(series));
    // fs.writeFileSync('test_t.txt', JSON.stringify(timeRangeData));
    const filepath = `assets/charts/chart_${chartFileIndex}.png`;
    const filename = `chart_${chartFileIndex}.png`;
    fs.writeFileSync(filepath, response.data);
    chartFileIndex++;
    return {
        filepath: filepath,
        filename: filename,
    };
}

exports.generateStockChartImage = generateStockChartImage;
