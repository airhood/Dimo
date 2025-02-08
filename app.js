const { connectDatabase, loadServersideLockData } = require('./database');
const { serverLog } = require('./server/server_logger');
const { loadRecentStockData } = require('./stock_system/stock_sim');
const { setTerminal } = require('./server/server_terminal');
const { startBucketCycle } = require('./message_reference_tracker');

const discord_bot = require('./discord_bot');

module.exports = {
    async run() {
        setTerminal();
        
        connectDatabase();
        
        loadServersideLockData();
        try {
            await loadRecentStockData();
        } catch (err) {
            serverLog(`[ERROR] Error loading recent stock data: ${err}`);
        }

        discord_bot.setup();

        startBucketCycle();
    }
}