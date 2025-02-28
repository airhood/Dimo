const { connectDatabase, loadServersideLockData } = require('./database');
const { serverLog } = require('./server/server_logger');
const { initStockSim } = require('./stock_system/stock_sim');
const { initTerminal } = require('./server/server_terminal');
const { startBucketCycle } = require('./message_reference_tracker');
const { initResourceMonitor, checkResource } = require('./server/resource_monitor');
const { initScheduleManager } = require('./stock_system/transaction_schedule_manager');
const { setUpdateInterval } = require('./koreanbots_update');

const discord_bot = require('./discord_bot');
const { initCreditSystem } = require('./stock_system/credit_system');

require('dotenv').config();

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
        
        const result3 = await initStockSim();
        if (!result3) return false;

        console.log('[BOOT] Stock simulation loaded');
        
        const result4 = await initCreditSystem();
        if (!result4) return false;

        console.log('[BOOT] Credit system loaded');

        const result5 = initScheduleManager();
        if (!result5) return false;

        console.log('[BOOT] Schedule Manager loaded');
        
        await discord_bot.setup();

        console.log('[BOOT] Discord bot loaded');
        
        startBucketCycle();

        console.log('[BOOT] Message Reference Tracker loaded');

        const memoryState = checkResource();
        if (!memoryState) return false;

        console.log('[BOOT] Server resource status: OK');

        console.log('[BOOT] Boot complete!');

        return true;
    }
}