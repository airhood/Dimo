const crypto = require('crypto');
const { calculateAssetValue, getAssetTotalLoan, initCreditSystemFuncDependencies } = require('./credit_system');

function getInterestRate() {
    const currentDate = new Date();
    const yearMonth = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
    
    const hash = crypto.createHash('sha256').update(yearMonth).digest('hex');
    const numericHash = parseInt(hash.substring(0, 8), 16);
    const rangeValue = (numericHash / 0xFFFFFFFF) * 4 + 1;

    return Number((Number(rangeValue.toFixed(2)) / 100).toFixed(4));
}

function getInterestRatePoint() {
    const currentDate = new Date();
    const yearMonth = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
    
    const hash = crypto.createHash('sha256').update(yearMonth).digest('hex');
    const numericHash = parseInt(hash.substring(0, 8), 16);
    const rangeValue = (numericHash / 0xFFFFFFFF) * 4 + 1;

    return Number(rangeValue.toFixed(2));
}

function getLoanInterestRate() {
    const r = getInterestRate();
    const a = 0.02;
    return Number((r + a).toFixed(4));
}

function getLoanInterestRatePoint() {
    const r = getInterestRatePoint();
    const a = 2.00;
    return Number((r + a).toFixed(2));
}

function getFixedDepositInterestRate() {
    const r = getInterestRate();
    const a = 0.01;
    return Number((r + a).toFixed(4));
}

function getFixedDepositInterestRatePoint() {
    const r = getInterestRatePoint();
    const a = 1.00;
    return Number((r + a).toFixed(2));
}

function getSavingsAccountInterestRate() {
    const r = getInterestRate();
    const a = 0.012;
    return Number((r + a).toFixed(4));
}

function getSavingsAccountInterestRatePoint() {
    const r = getInterestRatePoint();
    const a = 1.20;
    return Number((r + a).toFixed(2));
}

function calculateCompoundInterestRate(r, n) {
    return r * (Math.pow(r, n) - 1) / (r - 1);
}

function initBankManagerFuncDependencies(getStockPrice, getFuturePrice, getOptionPrice) {
    initCreditSystemFuncDependencies(getStockPrice, getFuturePrice, getOptionPrice, getLoanInterestRate);
}

function calculateLoanLimit(userAsset, creditRating, loanDueDate) {
    const assetValue = calculateAssetValue(userAsset, loanDueDate);

    const totalLoan = getAssetTotalLoan(userAsset);

    let multiplier = 0;

    if (creditRating >= 101 && creditRating <= 200) {
        multiplier = 0.3;
    } else if (creditRating >= 201 && creditRating <= 400) {
        multiplier = 0.7;
    } else if (creditRating >= 401 && creditRating <= 600) {
        multiplier = 1.2;
    } else if (creditRating >= 601 && creditRating <= 800) {
        multiplier = 2;
    } else if (creditRating >= 801 && creditRating <= 1000) {
        multiplier = 3;
    }

    const loanLimit = assetValue * multiplier;

    const loanLimitLeft = loanLimit - totalLoan;

    return Math.max(0, loanLimitLeft);
}


exports.getInterestRate = getInterestRate;
exports.getInterestRatePoint = getInterestRatePoint;
exports.getLoanInterestRate = getLoanInterestRate;
exports.getLoanInterestRatePoint = getLoanInterestRatePoint;
exports.getFixedDepositInterestRate = getFixedDepositInterestRate;
exports.getFixedDepositInterestRatePoint = getFixedDepositInterestRatePoint;
exports.getSavingsAccountInterestRate = getSavingsAccountInterestRate;
exports.getSavingsAccountInterestRatePoint = getSavingsAccountInterestRatePoint;

exports.calculateCompoundInterestRate = calculateCompoundInterestRate;

exports.calculateLoanLimit = calculateLoanLimit;

exports.initBankManagerFuncDependencies = initBankManagerFuncDependencies;