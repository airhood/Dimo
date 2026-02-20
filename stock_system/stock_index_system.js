const { getTickerList, getStockInfo } = require('./stock_sim');

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

exports.getDISDAQIndex = getDISDAQIndex;
