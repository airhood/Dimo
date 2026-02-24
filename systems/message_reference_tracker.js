
const fs = require('fs');
const path = require('path');

const TIME_LIMIT = 5 * 60 * 1000;
const STATE_FILE = path.join(__dirname, '../data/message_buckets.json');

let buckets = [[], [], []];
let currentBucket = 0;

// ── 상태 저장/복원 ─────────────────────────────────────────────────────────────

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ buckets, currentBucket }));
    } catch (err) {
        console.error('[message_reference_tracker] Failed to save state:', err);
    }
}

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return;
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const now = Date.now();

        // 만료되지 않은 일반 메시지만 복원 (special 항목은 복원 불필요)
        buckets = (data.buckets ?? [[], [], []]).map(bucket =>
            bucket.filter(entry =>
                entry.messageID !== 'special' && (now - entry.time) < TIME_LIMIT
            )
        );
        currentBucket = data.currentBucket ?? 0;
    } catch (err) {
        console.error('[message_reference_tracker] Failed to load state:', err);
    }
}

// ── 버킷 관리 ─────────────────────────────────────────────────────────────────

function startBucketCycle() {
    loadState();

    setInterval(() => {
        currentBucket++;
        if (currentBucket === 3) {
            currentBucket = 0;
        }
        buckets[(currentBucket + 1) % 3] = [];
        saveState();
    }, TIME_LIMIT);
}

function addToBucket(message, special) {
    if (special) {
        const now = Date.now();
        buckets[currentBucket].push({
            messageID: 'special',
            time: now,
        });
        saveState();
        return;
    }

    const messageTime = message.createdTimestamp;

    buckets[currentBucket].push({
        messageID: message.id,
        time: messageTime,
    });
    saveState();
}

function existsInCurrentBucket(messageID) {
    let special = false;
    const now = Date.now();
    const result1 = buckets[currentBucket].find(element => {
        if (element.messageID === messageID) {
            if (now - element.time < TIME_LIMIT) {
                return true;
            }
        } else if (element.messageID === 'special') {
            special = true;
        }
    });

    if (special) return 'special';

    if (result1) {
        return true;
    } else {
        const result2 = buckets[(currentBucket + 2) % 3].find(element => {
            if (element.messageID === messageID) {
                if (now - element.time < TIME_LIMIT) {
                    return true;
                }
            }
        });

        if (result2) {
            return true;
        } else {
            return false;
        }
    }
}

exports.startBucketCycle = startBucketCycle;
exports.addToBucket = addToBucket;
exports.existsInCurrentBucket = existsInCurrentBucket;
