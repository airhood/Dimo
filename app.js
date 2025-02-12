const { connectDatabase, loadServersideLockData } = require('./database');
const { serverLog } = require('./server/server_logger');
const { loadRecentStockData } = require('./stock_system/stock_sim');
const { setTerminal } = require('./server/server_terminal');
const { startBucketCycle } = require('./message_reference_tracker');
const { initResourceMonitor, checkResource } = require('./server/resource_monitor');
const { initScheduleManager } = require('./stock_system/transaction_schedule_manager');

const discord_bot = require('./discord_bot');

module.exports = {
    async run() {
        initResourceMonitor();
        
        setTerminal();
        
        const result1 = await connectDatabase();
        if (!result1) return false;
        
        const result2 = loadServersideLockData();
        if (!result2) return false;
        
        try {
            await loadRecentStockData();
            
        } catch (err) {
            serverLog(`[ERROR] Error loading recent stock data: ${err}`);
            return false;
        }

        const result3 = initScheduleManager();
        if (!result3) return false;
        
        discord_bot.setup();
        
        startBucketCycle();
        
        const memoryState = checkResource();
        if (!memoryState) return false;

        return true;
    }
}