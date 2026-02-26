const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../data/chart_settings.json');

const DEFAULT_SETTINGS = {
    chartType: 'area',
    candleInterval: 1,
    indicators: [],
};

function loadAll() {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveAll(data) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getUserChartSettings(userId) {
    const all = loadAll();
    return all[userId] ? { ...DEFAULT_SETTINGS, ...all[userId] } : { ...DEFAULT_SETTINGS };
}

function saveUserChartSettings(userId, settings) {
    const all = loadAll();
    all[userId] = { ...DEFAULT_SETTINGS, ...settings };
    saveAll(all);
}

function resetUserChartSettings(userId) {
    const all = loadAll();
    delete all[userId];
    saveAll(all);
}

module.exports = { getUserChartSettings, saveUserChartSettings, resetUserChartSettings, DEFAULT_SETTINGS };
