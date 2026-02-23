const { getTickerList, getStockInfo, getIndexPrice, getIndexTimeRangeData, calculateNormalizedIndex } = require('./stock_sim');

function getDISDAQIndex() {
    const tickers = getTickerList();
    let totalMarketCap = 0;

    tickers.forEach(ticker => {
        const info = getStockInfo(ticker);
        if (info) {
            totalMarketCap += info.price * info.totalQuantity;
        }
    });

    return calculateNormalizedIndex(totalMarketCap);
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
