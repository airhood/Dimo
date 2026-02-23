const { serverLog } = require('../server/server_logger');
const schedule = require('node-schedule');
const User = require('../schemas/user');
const Profile = require('../schemas/profile');
const { OPTION_UNIT_QUANTITY } = require('../setting');

const userDataList = {};

async function setUsersCredit(operations) {
    try {
        const result = await Profile.bulkWrite(operations);
        if (result.acknowledged) {
            return {
                state: 'success',
                data: null,
            };
        }
        else {
            return {
                state: 'error',
                data: null,
            };
        }
    } catch (err) {
        serverLog(`[ERROR] Error at 'database.js:setUsersCredit': ${err}`);
        return {
            state: 'error',
            data: null,
        };
    }
}

async function getAllUser() {
    try {
        const data = await User.find();

        if (data.length === 0) {
            return null;
        }
        return data;
    } catch (err) {
        serverLog(`[ERROR] Error at 'database.js:getAllUser': ${err}`);
        return false;
    }
}

async function cacheUsers() {
    const data = await getAllUser();

    if (data === false) {
        return false;
    } else if (data !== null) {
        const result = Promise.all(data.map(async (user) => {
            userDataList[user.userID] = {
                asset: user.asset,
                profile: user.profile,
            }
        }));
        return true;
    }
    return false;
}

function _calculateRatingFromAsset(asset) {
    const currentDate = new Date();

    let creditRating = 500;

    // 1. 순자산 가치 평가 (0~+200 / 음수 시 -200)
    const assetValue = calculateAssetValue(asset);
    if (assetValue > 0) {
        const maxAssetLog = Math.log(10000000000); // 100억 기준
        const assetLog = Math.max(0, Math.log(assetValue));
        const assetBonus = (assetLog / maxAssetLog) * 200;
        creditRating += Math.min(assetBonus, 200);
    } else {
        creditRating -= 200;
    }

    // 2. 대출 상환 이력 평가
    if (asset.loanHistory && asset.loanHistory.length > 0) {
        asset.loanHistory.forEach(record => {
            if (record.onTime) {
                creditRating += 20; // 기한 내 상환: +20
            } else {
                creditRating -= 50; // 연체 후 상환: -50
            }
        });
    }

    // 3. 현재 활성 대출 평가
    let totalDebt = 0;
    asset.loans.forEach(loan => {
        totalDebt += loan.amount;
        creditRating -= 30; // 활성 대출 1건당 -30
        if (new Date(loan.dueDate) < currentDate) {
            creditRating -= 100; // 연체 중인 대출 1건당 추가 -100
        }
    });

    // 4. 부채 비율 페널티 (0~-300)
    if (assetValue > 0 && totalDebt > 0) {
        const debtRatio = totalDebt / assetValue;
        creditRating -= Math.min(debtRatio * 300, 300);
    }

    // 5. 마진 부채 비율 페널티 (공매도·선물, 0~-100)
    let marginDebt = 0;
    asset.stockShortSales.forEach(sale => { marginDebt += sale.margin; });
    asset.futures.forEach(future => { marginDebt += future.margin; });
    if (assetValue > 0 && marginDebt > 0) {
        const marginRatio = marginDebt / assetValue;
        creditRating -= Math.min(marginRatio * 100, 100);
    }

    return Math.max(0, Math.min(1000, Math.round(creditRating)));
}

async function calculateCreditRating(id) {
    const user = await User.findOne({ userID: id }).populate('asset').populate('profile');
    if (!user) return null;
    return _calculateRatingFromAsset(user.asset);
}

function calculateFundCreditRating(fundAsset) {
    return _calculateRatingFromAsset(fundAsset);
}

function getCreditGrade(score) {
    if (score >= 900) return 'A+';
    if (score >= 850) return 'A';
    if (score >= 800) return 'A-';
    if (score >= 750) return 'B+';
    if (score >= 700) return 'B';
    if (score >= 650) return 'B-';
    if (score >= 600) return 'C+';
    if (score >= 550) return 'C';
    if (score >= 500) return 'C-';
    if (score >= 450) return 'D+';
    if (score >= 400) return 'D';
    if (score >= 350) return 'D-';
    return 'F';
}

// test
// setTimeout(async () => {
//     const credit = await calculateCreditRating('1145990786064859196');
//     console.log(`credit: ${credit}`);
// }, 1000 * 3);

async function updateCreditRating() {
    const operations = [];

    const addOperation = (profile_id, creditRating) => {
        operations.push({
            updateOne: {
                filter: { _id: profile_id },
                update: {
                    $set: {
                        credit_rating: creditRating,
                    }
                }
            }
        });
    };

    const promises = Object.entries(userDataList).map(async ([id, data]) => {
        try {
            const creditRating = await calculateCreditRating(id);
            if (creditRating === null) {
                serverLog(`[ERROR] Error while calculating credit rating. id: ${id}`);
                return;
            }
            addOperation(data.profile, creditRating);
        } catch (error) {
            serverLog(`[ERROR] Error during processing. id: ${id}, error: ${error}`);
            return false;
        }
    });

    await Promise.all(promises);

    const result = await setUsersCredit(operations);
    if (!result) {
        serverLog('[ERROR] Failed to update users credit.');
        return false;
    }

    return true;
}

async function initCreditSystem() {
    const result = await cacheUsers();
    if (!result) return false;

    schedule.scheduleJob('0 0 * * *', updateCreditRating);
    return true;
}

function calculateAssetValue(userAsset, loanDueDate = new Date()) {
    let value = 0;

    value += userAsset.balance;

    userAsset.stocks.forEach((stock) => {
        const currentPrice = getStockPrice(stock.ticker);
        value += currentPrice * stock.quantity;
    });

    userAsset.stockShortSales.forEach((short) => {
        const currentPrice = getStockPrice(short.ticker);
        value -= currentPrice * short.quantity;
    });

    userAsset.futures.forEach((future) => {
        value += future.margin;
        const currentPrice = getFuturePrice(future.ticker);
        value += (currentPrice - future.purchasePrice) * future.quantity * future.leverage;
    });

    userAsset.options.forEach((option) => {
        const currentOptionPrices = getOptionPrice(option.ticker);
        let currentPrice;
        if (option.optionType === 'call') {
            currentPrice = currentOptionPrices.call[option.strikePrice];
            if (!currentPrice) currentPrice = 0;
        } else if (option.optionType === 'put') {
            currentPrice = currentOptionPrices.put[option.strikePrice];
            if (!currentPrice) currentPrice = 0;
        }

        value += currentPrice * option.quantity * OPTION_UNIT_QUANTITY;
    });

    if (userAsset.etfs && userAsset.etfs.length > 0) {
        const { getEtfPrice } = require('./etf_system');
        userAsset.etfs.forEach((etf) => {
            const currentPrice = getEtfPrice(etf.etfId);
            value += (currentPrice ?? etf.purchasePrice) * etf.quantity;
        });
    }

    userAsset.binary_options.forEach((binary_option) => {
        value += binary_option.amount;
    });

    userAsset.fixed_deposits.forEach((fixed_deposit) => {
        value += fixed_deposit.amount;
        if (fixed_deposit.maturityDate < loanDueDate) {
            value += fixed_deposit.amount * fixed_deposit.interestRate;
        }
    });

    userAsset.savings_accounts.forEach((savings_account) => {
        const cycle = calculateDateDifferenceInDays(savings_account.startDate, new Date());
        value += savings_account * (cycle + 1);
    });

    userAsset.loans.forEach((loan) => {
        let interestRate = loan.interestRate;
        if (interestRate === 0) {
            interestRate = getLoanInterestRate();
        }
        value -= loan.amount * interestRate;
    });

    return value;
}

function calculateDateDifferenceInDays(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    const timeDifference = Math.abs(date2.getTime() - date2.getTime());

    const dayDifference = Math.floor(timeDifference / (1000 * 3600 * 24));

    return dayDifference;
}

function getAssetTotalLoan(userAsset) {
    let loanAmount = 0;
    userAsset.loans.forEach((loan) => {
        loanAmount += loan.amount;
    });
    return loanAmount;
}

let getStockPrice, getFuturePrice, getOptionPrice, getLoanInterestRate;

function initCreditSystemFuncDependencies(_getStockPrice, _getFuturePrice, _getOptionPrice, _getLoanInterestRate) {
    getStockPrice = _getStockPrice;
    getFuturePrice = _getFuturePrice;
    getOptionPrice = _getOptionPrice;
    getLoanInterestRate = _getLoanInterestRate;
}

exports.initCreditSystem = initCreditSystem;

exports.calculateAssetValue = calculateAssetValue;
exports.getAssetTotalLoan = getAssetTotalLoan;
exports.getCreditGrade = getCreditGrade;
exports.calculateFundCreditRating = calculateFundCreditRating;

exports.updateCreditRating = updateCreditRating;

exports.initCreditSystemFuncDependencies = initCreditSystemFuncDependencies;