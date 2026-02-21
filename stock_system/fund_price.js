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
    if (fundsPricesHistory.length === 0) return null;
    return fundsPricesHistory[fundsPricesHistory.length - 1][fundName] ?? null;
}

// 펀드 생성 등 즉시 캐시 갱신이 필요할 때 사용
function setFundPrice(fundName, price) {
    if (fundsPricesHistory.length === 0) {
        fundsPricesHistory.push({});
    }
    fundsPricesHistory[fundsPricesHistory.length - 1][fundName] = price;
}

// 펀드 이름 변경 시 캐시 키 갱신
function renameFundPrice(oldName, newName) {
    if (fundsPricesHistory.length === 0) return;
    const latest = fundsPricesHistory[fundsPricesHistory.length - 1];
    if (latest[oldName] !== undefined) {
        latest[newName] = latest[oldName];
        delete latest[oldName];
    }
}

schedule.scheduleJob('0 * * * *', () => {
    serverLog('[INFO] Update fund price');
    updateFundPrices();
});

async function initFundPriceSystem() {
    serverLog('[INFO] Initializing fund prices...');
    await updateFundPrices();
    serverLog('[INFO] Fund prices initialized');
    return true;
}

exports.getFundPrice = getFundPrice;
exports.setFundPrice = setFundPrice;
exports.renameFundPrice = renameFundPrice;
exports.initFundPriceSystem = initFundPriceSystem;