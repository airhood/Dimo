const fs = require('fs');
const { serverLog } = require('../server/server_logger');

// ── ETF Definitions ────────────────────────────────────────────────────────────
const ETF_DEFINITIONS = {
    'DISDAQ_1X':  { id: 'DISDAQ_1X',  name: 'DISDAQ ETF',          shortName: 'DISDAQ',       leverage:  1, initialNav: 10000 },
    'DISDAQ_2X':  { id: 'DISDAQ_2X',  name: 'DISDAQ 2X ETF',       shortName: 'DISDAQ 2X',    leverage:  2, initialNav: 10000 },
    'DISDAQ_3X':  { id: 'DISDAQ_3X',  name: 'DISDAQ 3X ETF',       shortName: 'DISDAQ 3X',    leverage:  3, initialNav: 10000 },
    'DISDAQ_5X':  { id: 'DISDAQ_5X',  name: 'DISDAQ 5X ETF',       shortName: 'DISDAQ 5X',    leverage:  5, initialNav: 10000 },
    'DISDAQ_INV': { id: 'DISDAQ_INV', name: 'DISDAQ 인버스 ETF',    shortName: 'DISDAQ INV',   leverage: -1, initialNav: 10000 },
    'DISDAQ_2XI': { id: 'DISDAQ_2XI', name: 'DISDAQ 2X 인버스 ETF', shortName: 'DISDAQ 2X INV',leverage: -2, initialNav: 10000 },
    'DISDAQ_3XI': { id: 'DISDAQ_3XI', name: 'DISDAQ 3X 인버스 ETF', shortName: 'DISDAQ 3X INV',leverage: -3, initialNav: 10000 },
    'DISDAQ_5XI': { id: 'DISDAQ_5XI', name: 'DISDAQ 5X 인버스 ETF', shortName: 'DISDAQ 5X INV',leverage: -5, initialNav: 10000 },
};

const ETF_STATE_FILE = './data/etf_state.json';
const REBALANCE_INTERVAL = 24;   // sim hours per rebalancing cycle (= 1 sim day)
const ETF_HISTORY_SIZE   = 48;   // keep same depth as STOCK_PRICE_HISTORY_SIZE

// ── Internal state ─────────────────────────────────────────────────────────────
// etfState[id] = { nav, dayStartIndex, snapshots: [{nav, dayStartIndex}] }
// snapshots[i] corresponds to indexPricesHistory[i] (aligned, same length)
const etfState = {};
let etfHoursUntilRebalance = REBALANCE_INTERVAL;

// Injected by initEtfSystem
let _getIndexPrice;
let _getIndexTimeRangeData;
let _getIndexHistoryLength;

// ── Helpers ────────────────────────────────────────────────────────────────────
function roundPos(n, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
}

// ── Init ───────────────────────────────────────────────────────────────────────
function initEtfSystem({ getIndexPrice, getIndexTimeRangeData, getIndexHistoryLength }) {
    _getIndexPrice        = getIndexPrice;
    _getIndexTimeRangeData = getIndexTimeRangeData;
    _getIndexHistoryLength = getIndexHistoryLength;

    const currentIndex = _getIndexPrice() ?? 1000;
    const historyLen   = _getIndexHistoryLength();

    // Default initial state (snapshots pre-filled to match current history depth)
    for (const etfId of Object.keys(ETF_DEFINITIONS)) {
        const initNav = ETF_DEFINITIONS[etfId].initialNav;
        etfState[etfId] = {
            nav:           initNav,
            dayStartIndex: currentIndex,
            snapshots:     Array.from({ length: Math.max(1, historyLen) }, () =>
                ({ nav: initNav, dayStartIndex: currentIndex })
            ),
        };
    }

    // Restore saved state if available
    if (fs.existsSync(ETF_STATE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(ETF_STATE_FILE, 'utf-8'));
            etfHoursUntilRebalance = saved.hoursUntilRebalance ?? REBALANCE_INTERVAL;
            for (const etfId of Object.keys(ETF_DEFINITIONS)) {
                const s = saved.etfState?.[etfId];
                if (s) {
                    etfState[etfId] = {
                        nav:           s.nav,
                        dayStartIndex: s.dayStartIndex,
                        snapshots:     s.snapshots ?? etfState[etfId].snapshots,
                    };
                }
            }
            serverLog('[INFO] ETF state loaded.');
        } catch (err) {
            serverLog(`[ERROR] Failed to load ETF state: ${err}`);
        }
    }
}

function saveEtfState() {
    try {
        const data = { hoursUntilRebalance: etfHoursUntilRebalance, etfState: {} };
        for (const etfId of Object.keys(ETF_DEFINITIONS)) {
            const s = etfState[etfId];
            data.etfState[etfId] = {
                nav:           s.nav,
                dayStartIndex: s.dayStartIndex,
                snapshots:     s.snapshots.slice(-ETF_HISTORY_SIZE),
            };
        }
        fs.writeFileSync(ETF_STATE_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
        serverLog(`[ERROR] Failed to save ETF state: ${err}`);
    }
}

// ── Hourly update (called by stock_sim hourly listener) ───────────────────────
// trimmed: true when stock_sim trimmed its oldest history entry this hour.
// This keeps etfState.snapshots in sync with indexPricesHistory.
function updateEtfHour(trimmed) {
    const currentIndex = _getIndexPrice?.();
    if (!currentIndex) return;

    etfHoursUntilRebalance--;

    // Daily rebalancing: apply leveraged daily return and reset day baseline
    if (etfHoursUntilRebalance <= 0) {
        for (const etfId of Object.keys(ETF_DEFINITIONS)) {
            const def   = ETF_DEFINITIONS[etfId];
            const state = etfState[etfId];
            const dailyReturn = state.dayStartIndex > 0
                ? (currentIndex / state.dayStartIndex) - 1
                : 0;
            state.nav           = Math.max(1, roundPos(state.nav * (1 + def.leverage * dailyReturn), 2));
            state.dayStartIndex = currentIndex;
        }
        etfHoursUntilRebalance = REBALANCE_INTERVAL;
        serverLog(`[INFO] ETF rebalanced. Index: ${currentIndex}`);
    }

    // Push snapshot for this new hour (aligned with indexPricesHistory)
    for (const etfId of Object.keys(ETF_DEFINITIONS)) {
        const state = etfState[etfId];
        if (trimmed && state.snapshots.length > 0) state.snapshots.shift();
        state.snapshots.push({ nav: state.nav, dayStartIndex: state.dayStartIndex });
        if (state.snapshots.length > ETF_HISTORY_SIZE) state.snapshots.shift();
    }

    saveEtfState();
}

// ── Price queries ──────────────────────────────────────────────────────────────

// Real-time intraday price:
//   ETF_price = prev_nav × (1 + leverage × (index_now / day_start_index − 1))
function getEtfPrice(etfId) {
    const def   = ETF_DEFINITIONS[etfId];
    const state = etfState[etfId];
    if (!def || !state) return null;

    const currentIndex = _getIndexPrice?.();
    if (!currentIndex || !state.dayStartIndex) return state.nav;

    const intradayReturn = (currentIndex / state.dayStartIndex) - 1;
    return Math.max(1, roundPos(state.nav * (1 + def.leverage * intradayReturn), 2));
}

// NAV at the start of today (= ETF price at market open of the current sim-day)
function getEtfNavPrice(etfId) {
    return etfState[etfId]?.nav ?? null;
}

function getEtfList() {
    return Object.values(ETF_DEFINITIONS).map(def => ({
        ...def,
        price:         getEtfPrice(def.id),
        nav:           etfState[def.id]?.nav,
        dayStartIndex: etfState[def.id]?.dayStartIndex,
    }));
}

function getEtfInfo(etfId) {
    const def = ETF_DEFINITIONS[etfId];
    if (!def) return null;
    return {
        ...def,
        price:                getEtfPrice(etfId),
        nav:                  etfState[etfId]?.nav,
        dayStartIndex:        etfState[etfId]?.dayStartIndex,
        hoursUntilRebalance:  etfHoursUntilRebalance,
    };
}

// ── Historical data for charts ─────────────────────────────────────────────────
// Returns same format as getIndexTimeRangeData: array of hour-arrays of prices.
// For each historical index price, applies the leverage formula using the NAV
// snapshot that was in effect at that hour.
function getEtfTimeRangeData(etfId, hoursAgo, minutesAgo) {
    const def   = ETF_DEFINITIONS[etfId];
    const state = etfState[etfId];
    if (!def || !state) return null;

    const indexData = _getIndexTimeRangeData?.(hoursAgo, minutesAgo);
    if (!indexData || indexData.length === 0) return [];

    const snapshots         = state.snapshots;
    const currentSnapshotIdx = snapshots.length - 1;

    // Replicate the hour-index offset logic from stock_sim to map rows → snapshots
    const currentMinuteIdx = new Date().getMinutes();
    let targetSnapshotIdx   = currentSnapshotIdx - hoursAgo;
    if (currentMinuteIdx < minutesAgo) targetSnapshotIdx -= 1;
    if (targetSnapshotIdx < 0)         targetSnapshotIdx = 0;

    return indexData.map((hourPrices, rowIdx) => {
        const sIdx    = Math.min(Math.max(0, targetSnapshotIdx + rowIdx), snapshots.length - 1);
        const snap    = snapshots[sIdx] ?? { nav: state.nav, dayStartIndex: state.dayStartIndex };

        return hourPrices.map(indexPrice => {
            if (!snap.dayStartIndex) return snap.nav;
            const intradayReturn = (indexPrice / snap.dayStartIndex) - 1;
            return Math.max(1, roundPos(snap.nav * (1 + def.leverage * intradayReturn), 2));
        });
    });
}

// ── Exports ────────────────────────────────────────────────────────────────────
module.exports = {
    initEtfSystem,
    updateEtfHour,
    getEtfPrice,
    getEtfNavPrice,
    getEtfList,
    getEtfInfo,
    getEtfTimeRangeData,
    ETF_DEFINITIONS,
};
