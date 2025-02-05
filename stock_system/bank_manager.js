
function getInterestRate() {
    const currentMonth = new Date().getMonth();
    const randomNumber = (Math.floor((currentMonth * 100) % 500) / 100) + 1;
    return randomNumber.toFixed(2);
}

function getLoanInterestRate() {
    const r = getInterestRate();
}

function getFixedDepositInterestRate() {
    const r = getInterestRate();
}

function getSavingsAccountInterestRate() {
    const r = getInterestRate();
}

exports.getInterestRate = getInterestRate;
exports.getLoanInterestRate = getLoanInterestRate;
exports.getFixedDepositInterestRate = getFixedDepositInterestRate;
exports.getSavingsAccountInterestRate = getSavingsAccountInterestRate;