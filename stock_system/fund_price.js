const { getFundList } = require("../database");
const { serverLog } = require("../server/server_logger");
const { calculateAssetValue } = require("./credit_system");
const schedule = require('node-schedule');

const fundsPricesHistory = [];

const FUND_INITIAL_PRICE = 1000;

function calculateFundPrice(asset_value, total_units) {
    if (total_units === 0) {
        return FUND_INITIAL_PRICE;
    }
    
    return asset_value / total_units;
}

async function updateFundPrices() {
    const fundList = await getFundList();
    if (fundList.state === 'error') {
        serverLog('[ERROR] Error while calculating fund price. Failed to get fund list.');
        return;
    } else if (fundList.state === 'success') {
        const fundPrices = {};
        fundList.data.forEach((fund) => {
            const assetValue = calculateAssetValue(fund.asset);
            fundPrices[fund.name] = calculateFundPrice(assetValue, fund.total_units);
        });

        fundsPricesHistory.push(fundPrices);
    }
}

function getFundPrice(fundName) {
    if (fundsPricesHistory[fundsPricesHistory.length - 1][fundName]) {
        return fundsPricesHistory[fundsPricesHistory.length - 1][fundName];
    }
    return null;
}

schedule.scheduleJob('0 0 * * *', () => {
    serverLog('[INFO] Update fund price');
    updateFundPrices();
});

exports.getFundPrice = getFundPrice;