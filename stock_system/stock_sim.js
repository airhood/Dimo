const fs = require('fs');
const schedule = require('node-schedule');
const math = require('mathjs');
const { serverLog } = require('../server/server_logger');
const { getTicker, getStockName } = require('./stock_name');
const { initBankManagerFuncDependencies, getInterestRate } = require('./bank_manager');
const { getKoreanTime } = require('../korean_time');


const sigma = 0.004;  // 변동성 (일일 변동성)
const days = 60;  // 시뮬레이션 기간 (60분 = 1시간)
const shockProbability = 0.07;  // 급등/급락 확률
const shockMagnitude = 0.007;  // 급등/급락 폭 (0.08%)
const newsImpact = 0.01;  // 뉴스 발표 시 가격 변화 (1%)
const bigNewsImpact = -0.3;  // 큰 뉴스 영향 (-0.3% 정도)
const minBigNewsDuration = 20;  // 큰 뉴스가 지속되는 최소 일수
const maxBigNewsDuration = 50;  // 큰 뉴스가 지속되는 최대 일수

function roundPos(number, pos) {
    return Math.round(number * Math.pow(10, pos)) / Math.pow(10, pos);
}

function simulateStockPrice(initialPrice, sigma, days, shockProbability, shockMagnitude, newsImpact, bigNewsImpact, bigNews) {
    const prices = [];
    const newsData = [];

    let currentPrice = initialPrice;

    let newsDuration = 0;
    let newsDurationTotal = 0;
    let currentNewsEffect = 0;
    let bigNewsDuration = 0;
    let bigNewsDurationTotal = 0;

    for (let day = 1; day <= days; day++) {
        // 기본 변동성 적용 (GBM)
        const randomShock = (Math.random() * 2 * sigma - sigma);
        currentPrice *= Math.exp(randomShock);

        if (Math.random() < shockProbability) {
            const shock = (Math.random() < 0.5 ? -1 : 1) * shockMagnitude;
            currentPrice *= (1 + shock);
        }

        if (Math.random() < 0.02) {
            currentNewsEffect = ((Math.random() < 0.5 ? -1 : 1) * newsImpact) * ((Math.random() + Math.random()) / 2);
            newsData.push(currentNewsEffect);
            currentPrice *= (1 + currentNewsEffect);

            
            if (bigNews === 1 || bigNews === -1) {
                if (Math.random() < 0.05) {
                    bigNewsDuration = Math.floor(Math.random() * (maxBigNewsDuration - minBigNewsDuration + 1) + minBigNewsDuration);
                    bigNewsDurationTotal = bigNewsDuration;
                    bigNews = 0;
                }
            }
        }
        
        if (newsDuration > 0) {
            const increasedSigma = sigma * 4 * ((newsDurationTotal - newsDuration) / newsDurationTotal);
            const randomNewsShock = (Math.random() * (1.5) * increasedSigma - increasedSigma);
            const newsEffectOnPrice = currentNewsEffect * (1 / newsDurationTotal);
            currentPrice *= (newsEffectOnPrice + randomNewsShock);
            newsDuration -= 1;
        } else {
            newsDuration = 0;
            newsDurationTotal = 0;
            newsEffect = 0;
        }

        if (bigNewsDuration > 0) {
            const increasedSigma = sigma * 30 * ((bigNewsDurationTotal - bigNewsDuration) / bigNewsDurationTotal);
            const randomNewsShock = (Math.random() * 2 * increasedSigma - increasedSigma);
            const newsEffectOnPrice = bigNewsImpact * (1 / bigNewsDurationTotal);
            currentPrice *= (1 + newsEffectOnPrice + randomNewsShock);
            bigNewsDuration -= 1;
        } else {
            bigNewsDuration = 0;
            bigNewsDurationTotal = 0;
        }

        if (currentPrice < 0) {
            currentPrice = 0;
            // 상장폐지
        }

        prices.push(roundPos(currentPrice, 2));
    }

    return [prices, newsData];
}

function convertToSimTime(time) {
    return (time / 7) * (2/12);
}

function calculateVolatility(hourlyVolatility) {
    // 연간 변동성 계산 (365일 기준, 하루 24시간)
    const annualVolatility = hourlyVolatility * Math.sqrt(365 * 24);
    
    // 1주일 옵션의 변동성 계산 (1주일 = 2개월, 즉 60일)
    const weeklyVolatility = annualVolatility * Math.sqrt(60 / 365);
    
    return weeklyVolatility;
}

// 표준 정규 분포의 누적 분포 함수
function cumulativeNormalDistribution(x) {
    return (1.0 + math.erf(x / Math.sqrt(2))) / 2.0;
}

// 선물 가격 계산 (Future Price)
function calculateFuturePrice(S, r, T) {
    return S * Math.pow(1 + r, T);
}

// 콜옵션 가격 계산 (Call Option Price - Black-Scholes)
function calculateCallOptionPrice(S, K, r, T, sigma) {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const N_d1 = cumulativeNormalDistribution(d1);
    const N_d2 = cumulativeNormalDistribution(d2);

    return S * N_d1 - K * Math.exp(-r * T) * N_d2;
}

// 풋옵션 가격 계산 (Put Option Price - Black-Scholes)
function calculatePutOptionPrice(S, K, r, T, sigma) {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const N_d1 = cumulativeNormalDistribution(-d1);
    const N_d2 = cumulativeNormalDistribution(-d2);

    return K * Math.exp(-r * T) * N_d2 - S * N_d1;
}

// const S = 100;  // 주식 가격 (현물 가격)
// const K = 100;  // 행사가격
// const r = 0.05; // 무위험 이자율 (5%: 고금리, 3%: 중간, 1%: 저금리)
// const T = 1;    // 만기까지 남은 시간 (1년)

const tickerList = [];

const stocksTotalQuantity = {};

const stocksPricesHistory = [];
const futuresPricesHistory = [];
const optionsPricesHistory = [];

const optionsStrikePricesList = [];

const newsDataHistory = [];
const newsTextHistory = [];


let futureTimeLeft = null;
let optionTimeLeft = null;

let lastContent;
const hourDataDivider = '---';
function backupRecentData(init) {
    let content = '';
    for (const [ticker, stockPrices] of Object.entries(stocksPricesHistory[stocksPricesHistory.length - 1])) {
        content += `[${ticker}]\n${stockPrices.join('\n')}\n`;
    }

    let error = false;

    if (content !== '') {
        if (lastContent) {
            const formattedContent = `${lastContent}\n${hourDataDivider}\n${content}`;
            fs.writeFile('./data/recent-stock_prices.txt', formattedContent, 'utf-8', (err) => {
                if (err) {
                    serverLog(`[ERROR] Error writing 'recent-stock_prices.txt': ${err}`);
                    error = true;
                }
            });
        } else if (!init) {
            serverLog(`[ERROR] Error writing 'recent-stock_prices.txt': lastContent undefined.`);
            error = true;
        }

        fs.appendFile('./data/stock_prices.txt', '<__hr__>\n' + content, 'utf-8', (err) => {
            if (err) {
                serverLog(`[ERROR] Error writing 'stock_prices.txt': ${err}`);
                error = true;
            }
        });
    }

    lastContent = content;

    if (error) {
        serverLog('[ERROR] Back-up recent stock data failed.');
    } else {
        serverLog('[INFO] Back-up recent stock data success.');
    }
}

async function loadRecentStockData() {
    return new Promise((resolve, reject) => {
        fs.access('./data/stock_meta.txt', fs.constants.F_OK, (err) => {
            if (err) {
                serverLog('[ERROR] File \'stock_meta.txt\' is missing');
                return reject(new Error('File is missing'));
            }

            fs.readFile('./data/stock_meta.txt', 'utf-8', (err, data) => {
                if (err) {
                    serverLog(`[ERROR] Error reading 'stock_meta.txt': ${err}`);
                    return reject(new Error('Error reading file'));
                }

                if (!data.trim()) {
                    serverLog('[ERROR] \'stock_meta.txt\' is empty or unreadable.');
                    return reject(new Error('File data missing'));
                }

                const lines = data.split('\n');

                let currentTicker;
                let currentTotalQuantity = null;
                
                lines.forEach(line => {
                    if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
                        if (currentTicker) {
                            stocksTotalQuantity[currentTicker] = currentTotalQuantity;
                        }
                        currentTicker = line.trim().slice(1, -1);
                        currentTotalQuantity = null;
                    } else if ((line.trim() !== '') && (currentTotalQuantity === null)) {
                        currentTotalQuantity = parseFloat(line.trim());
                    }
                });

                fs.access('./data/recent-stock_prices.txt', fs.constants.F_OK, (err) => {
                    if (err) {
                        serverLog('[ERROR] File \'recent-stock_prices.txt\' is missing');
                        return reject(new Error('File is missing'));
                    }
        
                    fs.readFile('./data/recent-stock_prices.txt', 'utf-8', async (err, data) => {
                        if (err) {
                            serverLog(`[ERROR] Error reading 'recent-stock_prices.txt': ${err}`);
                            return reject(new Error('Error reading file'));
                        }
        
                        if (!data.trim()) {
                            serverLog('[ERROR] \'recent-stock_prices.txt\' is empty or unreadable.');
                            return resolve();
                        }
        
                        const previousHourStockData = {};
                        const newStockData = {};
                        const lines = data.split('\n');
        
                        let currentTicker;
                        let currentPrices = [];
        
                        if (lines[0].trim() === '$init') {
                            lines.shift();
                            
                            lines.forEach(line => {
                                if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
                                    if (currentTicker) {
                                        newStockData[currentTicker] = currentPrices;
                                    }
                                    currentTicker = line.trim().slice(1, -1);
                                    currentPrices = [];
                                } else if (line.trim() !== '') {
                                    currentPrices.push(parseFloat(line.trim()));
                                }
                            });
        
                            if (currentTicker) {
                                newStockData[currentTicker] = currentPrices;
                            }
        
                            serverLog('[INFO] Loaded stock initial price data.');

                            const fillinStockData = {};
                            const fillinNewsData = {};
                            const firstStockData = {};
                            const firstNewsData = {};

                            for (const [ticker, stockPrices] of Object.entries(newStockData)) {
                                const [new_stockPrices, newsData] = simulateStockPrice(stockPrices[0], sigma, days, shockProbability, shockMagnitude, newsImpact, bigNewsImpact, false);
                                fillinStockData[ticker] = new_stockPrices;
                                fillinNewsData[ticker] = newsData;
                            }
                            stocksPricesHistory.push(fillinStockData);
                            newsDataHistory.push(fillinNewsData);
                            tickerList.push(...Object.keys(stocksPricesHistory[stocksPricesHistory.length - 1]));
                            try {
                                await loadOptionStrikePriceList();
                            } catch (err) {
                                serverLog(`[ERROR] Error loading option strike price: ${err}`);
                            }
                            calculateNextHourFuturePrice(fillinStockData);
                            calculateNextHourOptionPrice(fillinStockData);
                            backupRecentData(true);

                            for (const [ticker, stockPrices] of Object.entries(fillinStockData)) {
                                let [new_stockPrices, newsData] = simulateStockPrice(stockPrices[0], sigma, days, shockProbability, shockMagnitude, newsImpact, bigNewsImpact, false);
                                firstStockData[ticker] = new_stockPrices;
                                firstNewsData[ticker] = newsData;
                            }
                            stocksPricesHistory.push(firstStockData);
                            newsDataHistory.push(firstNewsData);
                            calculateNextHourFuturePrice(firstStockData);
                            calculateNextHourOptionPrice(firstStockData);
                            backupRecentData(false);
                        } else {
                            let hourIndex = 0;
                            lines.forEach(line => {
                                if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
                                    if (currentTicker) {
                                        if (currentPrices.length !== 60) {
                                            serverLog(`[ERROR] Wrong price data length. length: ${currentPrices.length}`);
                                            return reject(new Error('Wrong price data length'));
                                        } else {
                                            if (hourIndex === 0) {
                                                previousHourStockData[currentTicker] = currentPrices;
                                            } else if (hourIndex === 1) {
                                                newStockData[currentTicker] = currentPrices;
                                            } else {
                                                serverLog('[ERROR] Error loading recent stock data: Wrong hour index.');
                                                return reject(new Error('Wrong hour index'));
                                            }
                                        }
                                    }
                                    currentTicker = line.trim().slice(1, -1);
                                    currentPrices = [];
                                } else if (line.trim() === hourDataDivider) {
                                    if (currentPrices.length !== 60) {
                                        serverLog(`[ERROR] Wrong price data length. length: ${currentPrices.length}`);
                                        return reject(new Error('Wrong price data length'));
                                    } else {
                                        if (hourIndex === 0) {
                                            previousHourStockData[currentTicker] = currentPrices;
                                        } else if (hourIndex === 1) {
                                            newStockData[currentTicker] = currentPrices;
                                        } else {
                                            serverLog('[ERROR] Error loading recent stock data: Wrong hour index.');
                                            return reject(new Error('Wrong hour index'));
                                        }
                                    }
                                    hourIndex++;
                                    currentTicker = undefined;
                                } else if (line.trim() !== '') {
                                    currentPrices.push(parseFloat(line.trim()));
                                }
                            });
                            
                            if (currentTicker) {
                                if (currentPrices.length !== 60) {
                                    serverLog(`[ERROR] Wrong price data length. length: ${currentPrices.length}`);
                                    return reject(new Error('Wrong price data length'));
                                } else {
                                    if (hourIndex === 0) {
                                        previousHourStockData[currentTicker] = currentPrices;
                                    } else if (hourIndex === 1) {
                                        newStockData[currentTicker] = currentPrices;
                                    } else {
                                        serverLog('[ERROR] Error loading recent stock data: Wrong hour index.');
                                        return reject(new Error('Wrong hour index'));
                                    }
                                }
                            }

                            
                            stocksPricesHistory.push(previousHourStockData);
                            tickerList.push(...Object.keys(stocksPricesHistory[stocksPricesHistory.length - 1]));
                            try {
                                await loadOptionStrikePriceList();
                            } catch (err) {
                                serverLog(`[ERROR] Error loading option strike price: ${err}`);
                            }
                            calculateNextHourFuturePrice(previousHourStockData);
                            calculateNextHourOptionPrice(previousHourStockData);
                            backupRecentData(true);
                            stocksPricesHistory.push(newStockData);
                            calculateNextHourFuturePrice(newStockData);
                            calculateNextHourOptionPrice(newStockData);
                            backupRecentData(false);
                            serverLog('[INFO] Loaded recent stock price data.');
                        }

                        updateProductTimeLeft();

                        resolve();
                    });
                });
            });
        });
    });
}

async function initStockSim() {
    initBankManagerFuncDependencies(getStockPrice, getFuturePrice, getOptionPrice);

    try {
        await loadRecentStockData();
        return true;
    } catch (err) {
        serverLog(`[ERROR] Error loading recent stock data: ${err}`);
        return false;
    }
}

function calculateNextHourPrice() {
    const newStockData = {};
    const newNewsData = {};

    for (const [ticker, stock_prices] of Object.entries(stocksPricesHistory[stocksPricesHistory.length - 1])) {
        const bigNewsOccurred = Math.random() < 0.00001; // 0.001%
        const [new_stock_prices, _newNewsData] = simulateStockPrice(stock_prices[59], sigma, days, shockProbability, shockMagnitude, newsImpact, bigNewsImpact, bigNewsOccurred);
        newStockData[ticker] = new_stock_prices;
        newNewsData[ticker] = _newNewsData;
    }
    stocksPricesHistory.push(newStockData);
    newsDataHistory.push(newNewsData);

    calculateNextHourFuturePrice(newStockData);
    calculateNextHourOptionPrice(newStockData);
}

function calculateNextHourFuturePrice(stockData) {
    const newFutureData = {};

    for (const [ticker, stock_prices] of Object.entries(stockData)) {
        const newFuturePrices = [];
        for (const stock_price of stock_prices) {
            const result = calculateFuturePrice(stock_price, getInterestRate(), convertToSimTime(futureTimeLeft / 24));
            newFuturePrices.push(roundPos(result, 2));
        }
        newFutureData[ticker] = newFuturePrices;
    }

    futuresPricesHistory.push(newFutureData)
}

function calculateNextHourOptionPrice(stockData) {
    const newOptionData = {};

    for (const [ticker, stock_prices] of Object.entries(stockData)) {
        const newOptionPrices = [];
        for (const stock_price of stock_prices) {
            const call = {};
            const put = {};
            
            for (const strikePrice of optionsStrikePricesList[ticker]) {
                const callPrice = calculateCallOptionPrice(stock_price, strikePrice, getInterestRate(), convertToSimTime(optionTimeLeft / 24), calculateVolatility(sigma));
                const putPrice = calculatePutOptionPrice(stock_price, strikePrice, getInterestRate(), convertToSimTime(optionTimeLeft / 24), calculateVolatility(sigma));
                call[strikePrice.toString()] = roundPos(callPrice, 2);
                put[strikePrice.toString()] = roundPos(putPrice, 2);
            }

            newOptionPrices.push({
                call: call,
                put: put,
            });
        }
        newOptionData[ticker] = newOptionPrices;
    }

    optionsPricesHistory.push(newOptionData)
}

const HOURS_IN_A_WEEK = 24 * 7; // 1주일

function updateFutureTimeLeft() {
    if (futureTimeLeft === null) {
        const now = getKoreanTime(new Date());
        const friday = new Date(now);

        friday.setDate(now.getDate() + (6 - now.getDay() + 7) % 7);
        friday.setHours(0, 0, 0, 0);

        // 금요일의 00:00에서 금요일 23:59까지 남은 시간 계산
        const remainingTime = (friday - now) / (1000 * 60 * 60);

        futureTimeLeft = Math.ceil(remainingTime);
        return;
    }

    futureTimeLeft--;

    if (futureTimeLeft === 0) {
        futureExpireCallback();

        futureTimeLeft = HOURS_IN_A_WEEK;
    }
}

let futureExpireCallback;

function setOnFutureExpireListener(callback) {
    futureExpireCallback = callback;
}

function calculateOptionStrikePriceDist(price) {
    const roundPrice = roundPos(price, -2);
    const standardPrice = roundPrice - (roundPrice % 200);
    const strikePrice = [];
    const UNIT_DIFF = 500;
    for (let diff = UNIT_DIFF * (-7); diff <= UNIT_DIFF * 7; diff += UNIT_DIFF) {
        strikePrice.push(standardPrice + diff);
    }
    strikePrice.reverse();
    return strikePrice;
}

async function loadOptionStrikePriceList() {
    return new Promise((resolve, reject) => {
        fs.access('./data/option_strike_prices.txt', fs.constants.F_OK, (err) => {
            if (err) {
                serverLog('[ERROR] File \'option_strike_prices.txt\' is missing.');
                return reject(new Error('File \'option_strike_prices.txt\' is missing.'));
            }
    
            fs.readFile('./data/option_strike_prices.txt', 'utf-8', (err, data) => {
                if (err) {
                    serverLog(`[ERROR] Error reading  'option_strike_prices.txt': ${err}`);
                    return reject(new Error(`Error reading 'option_strike_prices.txt': ${err}`));
                }
    
                if (!data.trim()) {
                    updateOptionStrikePriceList();
                    return resolve();
                }
    
                const lines = data.split('\n');
    
                let currentTicker;
                let currentStrikePrices = [];
    
                lines.forEach(line => {
                    if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
                        if (currentTicker) {
                            optionsStrikePricesList[currentTicker] = currentStrikePrices;
                        }
                        currentTicker = line.trim().slice(1, -1);
                        currentStrikePrices = [];
                    } else if (line.trim() !== '') {
                        currentStrikePrices.push(parseFloat(line.trim()));
                    }
                });
    
                if (currentTicker) {
                    optionsStrikePricesList[currentTicker] = currentStrikePrices;
                }
    
                serverLog('[INFO] Loaded option strike price list.');
                return resolve();
            });
        });
    });
}

async function saveOptionStrikePriceData() {
    let content = '';
    for (const [ticker, optionStrikePrice] of Object.entries(optionsStrikePricesList)) {
        content += `[${ticker}]\n${optionStrikePrice.join('\n')}\n`;
    }

    let error = false;

    if (content !== '') {
        fs.writeFile('./data/option_strike_prices.txt', content, 'utf-8', (err) => {
            if (err) {
                serverLog(`[ERROR] Error writing 'option_strike_prices.txt': ${err}`);
                error = true;
            }
        });
    }

    if (error) {
        serverLog('[ERROR] Save option strike price data failed.');
    } else {
        serverLog('[INFO] Save option strike price data failed.');
    }
}

function updateOptionStrikePriceList() {
    for (const ticker of tickerList) {
        const underlyingAssetPrice = stocksPricesHistory[stocksPricesHistory.length - 1][ticker][0];
        optionsStrikePricesList[ticker] = calculateOptionStrikePriceDist(underlyingAssetPrice);
    }
    saveOptionStrikePriceData();
}

function getOptionStrikePriceIndex(ticker, strikePrice) {
    if (optionsStrikePricesList[ticker] === undefined) return null;
    const index = optionsStrikePricesList[ticker].indexOf(strikePrice);
    if (index === -1) return null;
    return index;
}

function getOptionStrikePriceList(ticker) {
    return optionsStrikePricesList[ticker];
}

function updateOptionTimeLeft() {
    if (optionTimeLeft === null) {
        const now = getKoreanTime(new Date());
        const friday = new Date(now);

        friday.setDate(now.getDate() + (6 - now.getDay() + 7) % 7);
        friday.setHours(0, 0, 0, 0);

        // 금요일의 00:00에서 금요일 23:59까지 남은 시간 계산
        const remainingTime = (friday - now) / (1000 * 60 * 60);

        optionTimeLeft = Math.ceil(remainingTime);
        return;
    }

    optionTimeLeft--;

    if (optionTimeLeft === 0) {
        optionExpireCallback();
        updateOptionStrikePriceList();
        optionTimeLeft = HOURS_IN_A_WEEK;
    }
}

let optionExpireCallback;

function setOnOptionExpireListener(callback) {
    optionExpireCallback = callback;
}

const COMPRESSION_CUTOFF = 6;
const COMPRESSION_RATE = 5;

exports.COMPRESSION_CUTOFF = COMPRESSION_CUTOFF;
exports.COMPRESSION_RATE = COMPRESSION_RATE;

function compressOldData() {
    if (stocksPricesHistory.length - 1 - COMPRESSION_CUTOFF >= 0) {
        for (const [ticker, stockPrices] of Object.entries(stocksPricesHistory[stocksPricesHistory.length - 1 - COMPRESSION_CUTOFF])) {
            stocksPricesHistory[stocksPricesHistory.length - 1 - COMPRESSION_CUTOFF][ticker] = stockPrices.filter((_, index) => index % COMPRESSION_RATE === 0);
        }
    
        for (const [ticker, futurePrices] of Object.entries(futuresPricesHistory[futuresPricesHistory.length - 1 - COMPRESSION_CUTOFF])) {
            futuresPricesHistory[futuresPricesHistory.length - 1 - COMPRESSION_CUTOFF][ticker] = futurePrices.filter((_, index) => index % COMPRESSION_RATE == 0);
        }
    
        for (const [ticker, optionPrices] of Object.entries(optionsPricesHistory[optionsPricesHistory.length - 1 - COMPRESSION_CUTOFF])) {
            optionsPricesHistory[optionsPricesHistory.length - 1 - COMPRESSION_CUTOFF][ticker] = optionPrices.filter((_, index) => index % COMPRESSION_RATE == 0);
        }
    }
}

function updateProductTimeLeft() {
    updateFutureTimeLeft();
    updateOptionTimeLeft();
}

const STOCK_PRICE_HISTORY_SIZE = 24 * 28; // 4주일

function updateStockData() {
    if (stocksPricesHistory.length >= STOCK_PRICE_HISTORY_SIZE) {
        stocksPricesHistory.splice(0, 1);
    }
    calculateNextHourPrice();
    updateProductTimeLeft();
}

schedule.scheduleJob('0 * * * *', () => {
    serverLog('[INFO] Update stock data');
    updateStockData();
    backupRecentData();
    compressOldData();
});

// test
// schedule.scheduleJob('* * * * *', () => {
//     serverLog('[INFO] Update stock data');
//     updateStockData();
//     backupRecentData(false);
//     compressOldData();
// });

exports.updateStockData = updateStockData;

function getStockPrice(ticker) {
    const now = new Date();
    const minutes = now.getMinutes();
    
    if (tickerList.includes(ticker)) {
        return stocksPricesHistory[stocksPricesHistory.length - 1][ticker][minutes];
    }
    return null;
}

function getStockList() {
    const now = new Date();
    const minutes = now.getMinutes();

    const stock_list = [];

    for (const [ticker, stock_prices] of Object.entries(stocksPricesHistory[stocksPricesHistory.length - 1])) {
        stock_list.push({
            ticker: ticker,
            price: stock_prices[minutes],
            difference: (stock_prices[minutes] - stocksPricesHistory[stocksPricesHistory.length - 2][ticker][minutes])
        });
    }
    return stock_list;
}

function getFuturePrice(ticker) {
    const now = new Date();
    const minutes = now.getMinutes();
    
    if (ticker in futuresPricesHistory[futuresPricesHistory.length - 1]) {
        return futuresPricesHistory[futuresPricesHistory.length - 1][ticker][minutes];
    }
    return null;
}

function getFutureExpirationDate() {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + futureTimeLeft);
    return date;
}

function getFutureList() {
    const now = new Date();
    const minutes = now.getMinutes();

    const future_list = [];

    for (const [ticker, future_prices] of Object.entries(futuresPricesHistory[futuresPricesHistory.length - 1])) {
        future_list.push({
            ticker: ticker,
            price: future_prices[minutes],
            difference: (future_prices[minutes] - futuresPricesHistory[futuresPricesHistory.length - 2][ticker][minutes])
        });
    }
    return future_list;
}

function getOptionPrice(ticker) {
    const now = new Date();
    const minutes = now.getMinutes();
    
    if (ticker in optionsPricesHistory[optionsPricesHistory.length - 1]) {
        return optionsPricesHistory[optionsPricesHistory.length - 1][ticker][minutes];
    }
    return null;
}

function getOptionExpirationDate() {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + optionTimeLeft);
    return date;
}

function getStockInfo(ticker) {
    if (ticker in stocksTotalQuantity) {
        return {
            name: getStockName(ticker),
            ticker: ticker,
            price: module.exports.getStockPrice(ticker),
            totalQuantity: stocksTotalQuantity[ticker],
        }
    }
    return null;
}

function tryGetTicker(str) {
    if (str.trim().toUpperCase() in stocksPricesHistory[stocksPricesHistory.length - 1]) {
        return str.trim().toUpperCase();
    }
    const ticker = getTicker(str);
    if (ticker in stocksPricesHistory[stocksPricesHistory.length - 1]) {
        return ticker;
    }
    return null;
}

function getTickerList() {
    return tickerList;
}

function getStockTimeRangeData(tickerList, hoursAgo, minutesAgo) {
    const currentHourIndex = stocksPricesHistory.length - 1;
    const currentMinuteIndex = new Date().getMinutes();

    let targetHourIndex = currentHourIndex - hoursAgo;
    let targetMinuteIndex = currentMinuteIndex - minutesAgo;

    if (targetMinuteIndex < 0) {
        targetHourIndex -= 1;
        targetMinuteIndex = 60 + targetMinuteIndex;
    }

    if (targetHourIndex < 0) {
        targetHourIndex = 0;
        targetMinuteIndex = 0;
    }

    const timeRangeData = [];

    for (let hourIndex = targetHourIndex; (hourIndex <= currentHourIndex) && (hourIndex < stocksPricesHistory.length); hourIndex++) {
        const hourData = Object.keys(stocksPricesHistory[hourIndex]).map(ticker => {
            const result = tickerList.filter((val) => {
                return val == ticker;
            });

            if (Array.isArray(result) && result.length === 0) {

            } else {
                const stockPrices = stocksPricesHistory[hourIndex][ticker];
                
                if (hourIndex <= currentHourIndex - COMPRESSION_CUTOFF) {
                    if (targetHourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(Math.floor(targetMinuteIndex / COMPRESSION_RATE), currentMinuteIndex + 1),
                            compressed: true,
                        };
                    } else if (hourIndex === targetHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(Math.floor(targetMinuteIndex / COMPRESSION_RATE), Math.floor(59 / COMPRESSION_RATE) + 1),
                            compressed: true,
                        };
                    } else if (hourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, Math.floor(59 / COMPRESSION_RATE) + 1),
                            compressed: true,
                        };
                    } else {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, Math.floor()),
                            compressed: true,
                        };
                    }
                } else {
                    if (targetHourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(targetMinuteIndex, currentMinuteIndex + 1),
                            compressed: false,
                        };
                    } else if (hourIndex === targetHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(targetMinuteIndex, 60),
                            compressed: false,
                        };
                    } else if (hourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, currentMinuteIndex + 1),
                            compressed: false,
                        };
                    } else {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, 60),
                            compressed: false,
                        };
                    }
                }
            }

        }).filter(element => element);

        if (hourData) {
            timeRangeData.push(hourData);
        }
    }

    return timeRangeData;
}

function getFutureTimeRangeData(tickerList, hoursAgo, minutesAgo) {
    const currentHourIndex = stocksPricesHistory.length - 1;
    const currentMinuteIndex = new Date().getMinutes();

    let targetHourIndex = currentHourIndex - hoursAgo;
    let targetMinuteIndex = currentMinuteIndex - minutesAgo;

    if (targetMinuteIndex < 0) {
        targetHourIndex -= 1;
        targetMinuteIndex = 60 + targetMinuteIndex;
    }

    if (targetHourIndex < 0) {
        targetHourIndex = 0;
        targetMinuteIndex = 0;
    }

    const timeRangeData = [];

    for (let hourIndex = targetHourIndex; (hourIndex <= currentHourIndex) && (hourIndex < futuresPricesHistory.length); hourIndex++) {
        const hourData = Object.keys(futuresPricesHistory[hourIndex]).map(ticker => {
            const result = tickerList.filter((val) => {
                return val == ticker;
            });

            if (Array.isArray(result) && result.length === 0) {

            } else {
                const stockPrices = futuresPricesHistory[hourIndex][ticker];
                
                if (hourIndex <= currentHourIndex - COMPRESSION_CUTOFF) {
                    if (targetHourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(Math.floor(targetMinuteIndex / COMPRESSION_RATE), currentMinuteIndex + 1),
                            compressed: true,
                        };
                    } else if (hourIndex === targetHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(Math.floor(targetMinuteIndex / COMPRESSION_RATE), Math.floor(59 / COMPRESSION_RATE) + 1),
                            compressed: true,
                        };
                    } else if (hourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, Math.floor(59 / COMPRESSION_RATE) + 1),
                            compressed: true,
                        };
                    } else {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, Math.floor()),
                            compressed: true,
                        };
                    }
                } else {
                    if (targetHourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(targetMinuteIndex, currentMinuteIndex + 1),
                            compressed: false,
                        };
                    } else if (hourIndex === targetHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(targetMinuteIndex, 60),
                            compressed: false,
                        };
                    } else if (hourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, currentMinuteIndex + 1),
                            compressed: false,
                        };
                    } else {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, 60),
                            compressed: false,
                        };
                    }
                }
            }

        }).filter(element => element);

        if (hourData) {
            timeRangeData.push(hourData);
        }
    }
    
    return timeRangeData;
}

function getOptionTimeRangeData(tickerList, hoursAgo, minutesAgo, direction, strikePrice) {
    if (!(direction === 'call') && !(direction === 'put')) return null;

    let error = false;

    if (error) return null;

    const currentHourIndex = stocksPricesHistory.length - 1;
    const currentMinuteIndex = new Date().getMinutes();

    let targetHourIndex = currentHourIndex - hoursAgo;
    let targetMinuteIndex = currentMinuteIndex - minutesAgo;

    if (targetMinuteIndex < 0) {
        targetHourIndex -= 1;
        targetMinuteIndex = 60 + targetMinuteIndex;
    }

    if (targetHourIndex < 0) {
        targetHourIndex = 0;
        targetMinuteIndex = 0;
    }

    const timeRangeData = [];

    for (let hourIndex = targetHourIndex; (hourIndex <= currentHourIndex) && (hourIndex < optionsPricesHistory.length); hourIndex++) {
        const hourData = Object.keys(optionsPricesHistory[hourIndex]).map(ticker => {
            const result = tickerList.filter((val) => {
                return val == ticker;
            });

            if (Array.isArray(result) && result.length === 0) {

            } else {
                const stockPrices = optionsPricesHistory[hourIndex][ticker];
                
                if (hourIndex <= currentHourIndex - COMPRESSION_CUTOFF) {
                    if (targetHourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(Math.floor(targetMinuteIndex / COMPRESSION_RATE), currentMinuteIndex + 1).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: true,
                        };
                    } else if (hourIndex === targetHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(Math.floor(targetMinuteIndex / COMPRESSION_RATE), Math.floor(59 / COMPRESSION_RATE) + 1).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: true,
                        };
                    } else if (hourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, Math.floor(59 / COMPRESSION_RATE) + 1).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: true,
                        };
                    } else {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, Math.floor()).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: true,
                        };
                    }
                } else {
                    if (targetHourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(targetMinuteIndex, currentMinuteIndex + 1).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: false,
                        };
                    } else if (hourIndex === targetHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(targetMinuteIndex, 60).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: false,
                        };
                    } else if (hourIndex === currentHourIndex) {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, currentMinuteIndex + 1).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: false,
                        };
                    } else {
                        return {
                            ticker: ticker,
                            prices: stockPrices.slice(0, 60).map((k) => {
                                if (direction === 'call') return (k.call[strikePrice] ? k.call[strikePrice] : 0);
                                else if (direction === 'put') return (k.put[strikePrice] ? k.put[strikePrice] : 0);
                            }),
                            compressed: false,
                        };
                    }
                }
            }

        }).filter(element => element);

        if (hourData) {
            timeRangeData.push(hourData);
        }
    }
    
    return timeRangeData;
}

exports.initStockSim = initStockSim;

exports.getStockPrice = getStockPrice;
exports.getStockList = getStockList;
exports.getFuturePrice = getFuturePrice;
exports.getFutureExpirationDate = getFutureExpirationDate;
exports.getFutureList = getFutureList;
exports.getOptionPrice = getOptionPrice;
exports.getOptionExpirationDate = getOptionExpirationDate;
exports.getStockInfo = getStockInfo;

exports.setOnFutureExpireListener = setOnFutureExpireListener;
exports.setOnOptionExpireListener = setOnOptionExpireListener;

exports.tryGetTicker = tryGetTicker;
exports.getTickerList = getTickerList;

exports.getStockTimeRangeData = getStockTimeRangeData;
exports.getFutureTimeRangeData = getFutureTimeRangeData;
exports.getOptionTimeRangeData = getOptionTimeRangeData;

exports.getOptionStrikePriceIndex = getOptionStrikePriceIndex;
exports.getOptionStrikePriceList = getOptionStrikePriceList;