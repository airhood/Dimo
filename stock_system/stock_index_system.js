const { getTickerList, getStockInfo, getIndexPrice, getIndexTimeRangeData } = require('./stock_sim');

function getDISDAQIndex() {
    const tickers = getTickerList();
    let totalMarketCap = 0;

    tickers.forEach(ticker => {
        const info = getStockInfo(ticker);
        if (info) {
            totalMarketCap += info.price * info.totalQuantity;
        }
    });

    return Math.round(totalMarketCap);
}

function getDISDAQIndexPrice() {
    return getIndexPrice();
}

function getDISDAQIndexTimeRangeData(hoursAgo, minutesAgo) {
    return getIndexTimeRangeData(hoursAgo, minutesAgo);
}

exports.getDISDAQIndex = getDISDAQIndex;
exports.getDISDAQIndexPrice = getDISDAQIndexPrice;
exports.getDISDAQIndexTimeRangeData = getDISDAQIndexTimeRangeData;
