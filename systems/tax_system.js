const { serverLog } = require('../server/server_logger');
const { calculateAssetValue } = require('./credit_system');
const TaxRecord = require('../schemas/tax_record');
const User = require('../schemas/user');
const Asset = require('../schemas/asset');

// ── Tax brackets (초과 누진) ─────────────────────────────────────────────────
// 100억 미만: 면세
// 100억 ~ 500억: 1%
// 500억 ~ 1000억: 2%
// 1000억 ~ 5000억: 3%
// 5000억 ~ 1조: 5%
// 1조+: 7%

const TAX_FLOOR = 10_000_000_000; // 100억

const BRACKETS = [
    { limit: 50_000_000_000,   rate: 0.01 }, // ~500억
    { limit: 100_000_000_000,  rate: 0.02 }, // ~1000억
    { limit: 500_000_000_000,  rate: 0.03 }, // ~5000억
    { limit: 1_000_000_000_000,rate: 0.05 }, // ~1조
    { limit: Infinity,          rate: 0.07 }, // 1조+
];

function calculateTax(totalAssets) {
    if (totalAssets < TAX_FLOOR) return 0;

    let tax = 0;
    let prev = TAX_FLOOR;

    for (const { limit, rate } of BRACKETS) {
        if (totalAssets <= prev) break;
        const taxable = Math.min(totalAssets, limit) - prev;
        tax += taxable * rate;
        prev = limit;
    }

    return Math.round(tax);
}

// ── Assessment ────────────────────────────────────────────────────────────────

// 다음 금요일 00:00 계산
function nextFriday() {
    const now = new Date();
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    const friday = new Date(now);
    friday.setDate(now.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);
    return friday;
}

/**
 * 모든 유저의 자산을 평가해 과세 대상에게 세금을 고지한다.
 * 선물 만기 직후 호출됨.
 */
async function assessTax() {
    try {
        const dueDate = nextFriday();
        const assessedAt = new Date();

        const users = await User.find({}).populate('asset');
        let assessed = 0;

        await Promise.all(users.map(async (user) => {
            if (!user.asset) return;
            const totalAssets = calculateAssetValue(user.asset);
            const taxAmount = calculateTax(totalAssets);
            if (taxAmount <= 0) {
                // 과세 대상 아니면 기존 고지 삭제
                await TaxRecord.deleteOne({ userID: user.userID });
                return;
            }

            await TaxRecord.findOneAndUpdate(
                { userID: user.userID },
                { totalAssets, taxAmount, paid: false, assessedAt, dueDate },
                { upsert: true, new: true }
            );
            assessed++;
        }));

        serverLog(`[INFO] Tax assessed: ${assessed} users notified. Due: ${dueDate.toISOString()}`);
    } catch (err) {
        serverLog(`[ERROR] Error at 'tax_system.js:assessTax': ${err}`);
    }
}

// ── Forced collection ─────────────────────────────────────────────────────────

/**
 * 납부 기한이 지난 미납자 전원 강제 징수.
 * assessTax() 전에 호출됨.
 */
async function collectPendingTaxes() {
    try {
        const now = new Date();
        const unpaid = await TaxRecord.find({ paid: false, dueDate: { $lte: now } });

        await Promise.all(unpaid.map(async (record) => {
            const user = await User.findOne({ userID: record.userID });
            if (!user) return;

            const userAsset = await Asset.findById(user.asset);
            if (!userAsset) return;

            const deduct = Math.min(record.taxAmount, Math.max(0, userAsset.balance));
            userAsset.balance -= deduct;
            userAsset.balance = Math.round(userAsset.balance);
            await userAsset.save();

            await TaxRecord.deleteOne({ userID: record.userID });

            serverLog(`[INFO] Tax force-collected: ${record.userID}, amount: ${deduct.toLocaleString()}원 (bill: ${record.taxAmount.toLocaleString()}원)`);
        }));

        if (unpaid.length > 0) {
            serverLog(`[INFO] Tax force-collection complete: ${unpaid.length} users`);
        }
    } catch (err) {
        serverLog(`[ERROR] Error at 'tax_system.js:collectPendingTaxes': ${err}`);
    }
}

// ── Voluntary payment ─────────────────────────────────────────────────────────

/**
 * 자발적 납부.
 * @returns {{ state: 'success'|'no_record'|'already_paid'|'no_balance'|'error', taxAmount?: number }}
 */
async function payTax(userId) {
    try {
        const record = await TaxRecord.findOne({ userID: userId });
        if (!record) return { state: 'no_record' };
        if (record.paid) return { state: 'already_paid', taxAmount: record.taxAmount };

        const user = await User.findOne({ userID: userId });
        if (!user) return { state: 'error' };

        const userAsset = await Asset.findById(user.asset);
        if (!userAsset) return { state: 'error' };

        if (userAsset.balance < record.taxAmount) {
            return { state: 'no_balance', taxAmount: record.taxAmount, balance: userAsset.balance };
        }

        userAsset.balance -= record.taxAmount;
        userAsset.balance = Math.round(userAsset.balance);
        await userAsset.save();

        record.paid = true;
        await record.save();

        serverLog(`[INFO] Tax paid voluntarily: ${userId}, amount: ${record.taxAmount.toLocaleString()}원`);
        return { state: 'success', taxAmount: record.taxAmount };
    } catch (err) {
        serverLog(`[ERROR] Error at 'tax_system.js:payTax': ${err}`);
        return { state: 'error' };
    }
}

// ── Query ─────────────────────────────────────────────────────────────────────

async function getTaxRecord(userId) {
    return TaxRecord.findOne({ userID: userId });
}

// ── Boot-time init ────────────────────────────────────────────────────────────

/**
 * 서버 시작 시 호출.
 * 1) 만료된 미납 세금 강제 징수
 * 2) 활성 고지가 없으면 즉시 새 세금 고지
 */
async function initTaxSystem() {
    try {
        // 1) 만기 지난 미납 세금 먼저 처리
        await collectPendingTaxes();

        // 2) 현재 유효한 (미납, 아직 만기 안 된) 고지가 있는지 확인
        const now = new Date();
        const activeCount = await TaxRecord.countDocuments({ paid: false, dueDate: { $gt: now } });

        // 3) 없으면 즉시 고지
        if (activeCount === 0) {
            serverLog('[INFO] No active tax assessment found on boot. Running immediate assessment.');
            await assessTax();
        } else {
            serverLog(`[INFO] Tax system initialized. ${activeCount} active assessment(s) found.`);
        }
    } catch (err) {
        serverLog(`[ERROR] Error at 'tax_system.js:initTaxSystem': ${err}`);
    }
}

// ── Public exports ────────────────────────────────────────────────────────────

module.exports = {
    calculateTax,
    assessTax,
    collectPendingTaxes,
    initTaxSystem,
    payTax,
    getTaxRecord,
    TAX_FLOOR,
    BRACKETS,
};
