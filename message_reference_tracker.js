
const TIME_LIMIT = 5 * 60 * 1000;

let buckets = [[], [], []];
let currentBucket = 0;

function startBucketCycle() {
    setInterval(() => {
        currentBucket++;
        if (currentBucket === 3) {
            currentBucket = 0;
        }
        buckets[(currentBucket + 1)%3] = [];
    }, TIME_LIMIT)
}

function addToBucket(message, special) {
    if (special) {
        const now = new Date();
        buckets[currentBucket].push({
            messageID: 'special',
            time: now,
        });
        return;
    }

    const messageTime = message.createdTimestamp;

    buckets[currentBucket].push({
        messageID: message.id,
        time: messageTime,
    });
}

function existsInCurrentBucket(messageID) {
    let special = false;
    const now = new Date();
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