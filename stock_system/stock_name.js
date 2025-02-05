const fs = require('fs');

function loadTickerData(filePath) {
    const map = new Map();

    const data = fs.readFileSync(filePath, 'utf-8').split('\n');

    data.forEach(line => {
        if (line.trim() !== '') {
            const [ticker, name] = line.split(' ').map(str => str.trim());
            if (ticker && name) {
                map.set(ticker, name);
            }
        }
    });
    
    return map;
}

const tickerMap = loadTickerData('./data/stock_names.txt');

function getStockName(ticker) {
    if (tickerMap.has(ticker)) {
        return tickerMap.get(ticker);
    } else {
        return null;
    }
}

function getTicker(name) {
    let result = [...tickerMap.entries()]
        .filter(({ 1: v }) => v === name)
        .map(([k]) => k);
    
    if (!result.length) return null;
    return result[0];
}

exports.getStockName = getStockName;
exports.getTicker = getTicker;