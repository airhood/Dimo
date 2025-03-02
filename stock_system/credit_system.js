const { serverLog } = require('../server/server_logger');
const schedule = require('node-schedule');
const User = require('../schemas/user');
const Profile = require('../schemas/profile');
const { OPTION_UNIT_QUANTITY } = require('../database');

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

async function calculateCreditRating(id) {
    const user = await User.findOne({ userID: id }).populate('asset').populate('profile');
    if (!user) return null;

    // 1. 자산 가치 계산 (대출 날짜를 기준으로 예금 및 적금에서 이자 제외)
    const assetValue = calculateAssetValue(user.asset, new Date());

    // 2. 기본 신용 점수 설정 (100점으로 설정)
    let creditRating = 100;

    // 3. 대출 상환 이력 평가
    user.asset.loans.forEach(loan => {
        const currentDate = new Date();
        const dueDate = new Date(loan.dueDate);
        creditRating -= 50;
    });

    let assetScoreIncrease;
    if (assetValue <= 0) {
        assetScoreIncrease = 0;
    } else {
        // 4. 자산 가치에 따른 점수 증가 (자산 가치가 많을수록 점수 상승)
        const maxAssetValue = Math.log(10000000000); // 자산이 100억 이상일 경우 최대 상승 한도
        assetScoreIncrease = (Math.log(assetValue) / maxAssetValue) * 1000; // 자산 비례 상승 (최대 600점)
    }

    // 자산 가치가 많을수록 점수 상승하지만 최대 1000점까지 상승
    creditRating += Math.min(assetScoreIncrease, 1000);

    // 5. 부채 수준 평가 (대출 및 마진 거래의 부채 합산)
    let totalDebt = 0;

    // 대출 부채 평가
    user.asset.loans.forEach(loan => {
        totalDebt += loan.amount;
    });

    // 마진 거래 부채 평가 (주식 공매도, 선물 등)
    user.asset.stockShortSales.forEach(sale => {
        totalDebt += sale.margin;  // 공매도의 마진 금액
    });

    user.asset.futures.forEach(future => {
        totalDebt += future.margin;  // 선물 거래의 마진 금액
    });

    let debtReduction;
    if (assetValue === 0) {
        debtReduction = 0;
    } else {
        // 6. 부채로 인한 신용 감소 계산
        const maxDebtReduction = 700; // 최대 신용 감소 폭 (300점)
        debtReduction = Math.min((totalDebt / assetValue) * maxDebtReduction, maxDebtReduction);
    }

    // 부채로 인한 신용 점수 감소
    creditRating -= debtReduction;

    // 7. 자산이 0 이하인 경우 신용 점수 150점 감소
    if (assetValue <= 0) {
        creditRating -= 150;
    }

    // 8. 신용 점수 범위 제한 (최소 0점, 최대 1000점)
    creditRating = Math.max(0, Math.min(creditRating, 1000));
    creditRating = Math.round(creditRating);

    return creditRating;
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

function calculateAssetValue(userAsset, loanDueDate) {
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
        const strikePriceIndex = getOptionStrikePriceIndex(option.strikePrice);
        if (strikePriceIndex === null) return;
        let currentPrice;
        if (option.optionType === 'call') {
            currentPrice = currentOptionPrices.call[strikePriceIndex];
        } else if (option.optionType === 'put') {
            currentPrice = currentOptionPrices.put[strikePriceIndex];
        }

        value += currentPrice * option.quantity * OPTION_UNIT_QUANTITY;
    });

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

let getStockPrice, getFuturePrice, getOptionPrice, getOptionStrikePriceIndex;

function initCreditSystemFuncDependencies(_getStockPrice, _getFuturePrice, _getOptionPrice, _getOptionStrikePriceIndex) {
    getStockPrice = _getStockPrice;
    getFuturePrice = _getFuturePrice;
    getOptionPrice = _getOptionPrice;
    getOptionStrikePriceIndex = _getOptionStrikePriceIndex;
}

exports.initCreditSystem = initCreditSystem;

exports.calculateAssetValue = calculateAssetValue;
exports.getAssetTotalLoan = getAssetTotalLoan;

exports.updateCreditRating = updateCreditRating;

exports.initCreditSystemFuncDependencies = initCreditSystemFuncDependencies;