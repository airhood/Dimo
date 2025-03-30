const { serverLog } = require("../server/server_logger");

let keywordList = [];

const keywordFilePath = './data/filter_keywords.txt';

function loadKeywordsFromFile() {
    fs.readFile(keywordFilePath, 'utf8', (err, data) => {
        if (err) {
            serverLog(`[ERROR] Error reading 'filter_keywords.txt': ${err}`);
            return;
        }

        keywordList = data.split('\n').map(line => line.trim()).filter(line => line !== '');
        serverLog(`[ERROR] Loaded filter keywords.`);
    });
}

function containsKeyword(message) {
    return keywordList.some(keyword => message.includes(keyword));
}

function addKeyword(keyword) {
    if (!keywordList.includes(keyword)) {
        keywordList.push(keyword);
        serverLog(`[INFO] '${keyword}' was added to keyword list.`);
        return true;
    } else {
        serverLog(`[INFO] '${keyword}' already exists in keyword list.`);
        return false;
    }
}

function removeKeyword(keyword) {
    const index = keywordList.indexOf(keyword);
    if (index > -1) {
        keywordList.splice(index, 1);
        serverLog(`[INFO] '${keyword}' was removed from keyword list.`);
        return true;
    } else {
        console.log(`${keyword} 는 목록에 없습니다.`);
        serverLog(`[INFO] '${keyword}' doesn't exist in keyword list.`);
        return false;
    }
}

function filterMessage(message) {
    if (containsKeyword(message)) {
        return false;
    } else {
        return true;
    }
}

function wrapMentions(message) {
    // @everyone과 @here만 감싸기 위한 정규 표현식
    const mentionPattern = /(@everyone|@here)/g;
    
    // 멘션을 `로 감싸기
    return message.replace(mentionPattern, '`$&`');
}

exports.loadKeywordsFromFile = loadKeywordsFromFile;
exports.addKeyword = addKeyword;
exports.removeKeyword = removeKeyword;
exports.filterMessage = filterMessage;
exports.wrapMentions = wrapMentions;