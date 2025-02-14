const crypto = require('crypto');

function getInterestRate() {
    const currentDate = new Date();
    const yearMonth = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
    
    const hash = crypto.createHash('sha256').update(yearMonth).digest('hex');
    const numericHash = parseInt(hash.substring(0, 8), 16);
    const rangeValue = (numericHash / 0xFFFFFFFF) * 4 + 1;

    return (rangeValue.toFixed(2) / 100);
}

function getInterestRatePoint() {
    const currentDate = new Date();
    const yearMonth = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
    
    const hash = crypto.createHash('sha256').update(yearMonth).digest('hex');
    const numericHash = parseInt(hash.substring(0, 8), 16);
    const rangeValue = (numericHash / 0xFFFFFFFF) * 4 + 1;

    return rangeValue.toFixed(2);
}

function getLoanInterestRate() {
    const r = getInterestRate();
    const a = 0.02;
    return r + a;
}

function getLoanInterestRatePoint() {
    const r = getInterestRatePoint();
    const a = 2.00;
    return r + a;
}

function getFixedDepositInterestRate() {
    const r = getInterestRate();
    const a = 0.01;
    return r + a;
}

function getFixedDepositInterestRatePoint() {
    const r = getInterestRate();
    const a = 1.00;
    return r + a;
}

function getSavingsAccountInterestRate() {
    const r = getInterestRate();
    const a = 0.015;
    return r + a;
}

function getSavingsAccountInterestRatePoint() {
    const r = getInterestRate();
    const a = 1.50;
    return r + a;
}

exports.getInterestRate = getInterestRate;
exports.getInterestRatePoint = getInterestRatePoint;
exports.getLoanInterestRate = getLoanInterestRate;
exports.getLoanInterestRatePoint = getLoanInterestRatePoint;
exports.getFixedDepositInterestRate = getFixedDepositInterestRate;
exports.getFixedDepositInterestRatePoint = getFixedDepositInterestRatePoint;
exports.getSavingsAccountInterestRate = getSavingsAccountInterestRate;
exports.getSavingsAccountInterestRatePoint = getSavingsAccountInterestRatePoint;