const schedule = require('node-schedule');
const { getAllUserAsset } = require('./database');
const { calculateAssetValue } = require('./stock_system/credit_system');

let leaderboard = [];

async function updateLeaderboard() {
    const users = await getAllUserAsset();
    if (users.state === 'error') {
        serverLog('[ERROR] Error while updating leaderboard. Failed to get users.');
        return;
    } else if (users.state === 'success') {
        const userStats = [];
        users.data.forEach((user) => {
            const assetValue = calculateAssetValue(user.asset);
            userStats.push({
                userID: user.userID,
                assetValue: assetValue,
            });
        });
        
        leaderboard = userStats.sort((a, b) => b.assetValue - a.assetValue);
    }
}

schedule.scheduleJob('0 0 * * *', () => {
    updateLeaderboard();
});