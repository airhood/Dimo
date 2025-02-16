const { connectDatabase, loadServersideLockData } = require('./database');
const { serverLog } = require('./server/server_logger');
const { loadRecentStockData } = require('./stock_system/stock_sim');
const { initTerminal } = require('./server/server_terminal');
const { startBucketCycle } = require('./message_reference_tracker');
const { initResourceMonitor, checkResource } = require('./server/resource_monitor');
const { initScheduleManager } = require('./stock_system/transaction_schedule_manager');

const discord_bot = require('./discord_bot');

module.exports = {
    async run() {
        initResourceMonitor();

        console.log('[BOOT] Resource Monitor loaded');
        
        initTerminal();

        console.log('[BOOT] Server Terminal loaded');
        
        const result1 = await connectDatabase();
        if (!result1) return false;

        console.log('[BOOT] Database loaded');
        
        const result2 = loadServersideLockData();
        if (!result2) return false;

        console.log('[BOOT] Serverside lock data loaded');
        
        try {
            await loadRecentStockData();
            
        } catch (err) {
            serverLog(`[ERROR] Error loading recent stock data: ${err}`);
            return false;
        }

        console.log('[BOOT] Stock data loaded');

        const result3 = initScheduleManager();
        if (!result3) return false;

        console.log('[BOOT] Schedule Manager loaded');
        
        discord_bot.setup();

        console.log('[BOOT] Discord bot loaded');
        
        startBucketCycle();

        console.log('[BOOT] Message Reference Tracker loaded');
        
        const memoryState = checkResource();
        if (!memoryState) return false;

        console.log('[BOOT] Server resource status: OK');

        return true;
    }
}