const fs = require('fs');
const { serverLog } = require("../server/server_logger");

let keywordList = [];

const keywordFilePath = './data/filter_keywords.txt';

function loadKeywordsFromFile() {
    try {
        if (!fs.existsSync(keywordFilePath)) {
            fs.writeFileSync(keywordFilePath, '', 'utf8');
            serverLog('[INFO] Created empty filter_keywords.txt');
            return;
        }
        const data = fs.readFileSync(keywordFilePath, 'utf8');
        keywordList = data.split('\n').map(line => line.trim()).filter(line => line !== '');
        serverLog(`[INFO] Loaded ${keywordList.length} filter keywords.`);
    } catch (err) {
        serverLog(`[ERROR] Error reading 'filter_keywords.txt': ${err}`);
    }
}

function saveKeywordsToFile() {
    try {
        fs.writeFileSync(keywordFilePath, keywordList.join('\n'), 'utf8');
    } catch (err) {
        serverLog(`[ERROR] Error writing 'filter_keywords.txt': ${err}`);
    }
}

// Case-insensitive keyword check
function containsKeyword(message) {
    const lower = message.toLowerCase();
    return keywordList.some(keyword => lower.includes(keyword.toLowerCase()));
}

function addKeyword(keyword) {
    const normalized = keyword.trim();
    if (!keywordList.some(k => k.toLowerCase() === normalized.toLowerCase())) {
        keywordList.push(normalized);
        saveKeywordsToFile();
        serverLog(`[INFO] '${normalized}' was added to keyword list.`);
        return true;
    } else {
        serverLog(`[INFO] '${normalized}' already exists in keyword list.`);
        return false;
    }
}

function removeKeyword(keyword) {
    const normalized = keyword.trim();
    const index = keywordList.findIndex(k => k.toLowerCase() === normalized.toLowerCase());
    if (index > -1) {
        keywordList.splice(index, 1);
        saveKeywordsToFile();
        serverLog(`[INFO] '${normalized}' was removed from keyword list.`);
        return true;
    } else {
        serverLog(`[INFO] '${normalized}' doesn't exist in keyword list.`);
        return false;
    }
}

// Returns true if the message is clean, false if it contains a keyword
function filterMessage(message) {
    return !containsKeyword(message);
}

function wrapMentions(message) {
    const mentionPattern = /(@everyone|@here)/g;
    return message.replace(mentionPattern, '`$&`');
}

exports.loadKeywordsFromFile = loadKeywordsFromFile;
exports.addKeyword = addKeyword;
exports.removeKeyword = removeKeyword;
exports.filterMessage = filterMessage;
exports.wrapMentions = wrapMentions;
