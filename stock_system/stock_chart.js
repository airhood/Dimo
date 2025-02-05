const axios = require('axios');
const fs = require('fs');
const { getStockName } = require('./stock_name');
// import axios from 'axios';
// import fs from 'fs';

let index = 0;

async function generateStockChartImage(ticker, timeRangeData, targetMinuteIndex) {
    const name = getStockName(ticker);

    const series = [];

    const maxHourIndex = timeRangeData.length - 1;
    const maxMinuteIndex = timeRangeData[maxHourIndex][0].prices.length - 1;
    const currentTime = (maxHourIndex * 60) + maxMinuteIndex;

    console.log('maxHourIndex: ', maxHourIndex);
    console.log('maxMinuteIndex: ', maxMinuteIndex);
    console.log('currentTime: ', currentTime);
    
    timeRangeData.forEach((hourData, hour) => {
        hourData.forEach((priceData) => {
            const ticker = priceData.ticker;
            console.log(`ticker: ${ticker}`);
            console.log(`hourData.prices: ${priceData.prices}`);

            const data = priceData.prices.map((price, minute) => {
                const time = (hour * 60) + minute;
                const relTime = time - currentTime;
                return [relTime, price];
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
        series: series,
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
    const filepath = `assets/charts/chart_${index}.png`;
    const filename = `chart_${index}.png`;
    fs.writeFileSync(filepath, response.data);
    index++;
    return {
        filepath: filepath,
        filename: filename,
    };
}

exports.generateStockChartImage = generateStockChartImage;
