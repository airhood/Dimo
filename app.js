const { connectDatabase, loadServersideLockData } = require('./database');
const { initStockSim, addHourlyListener, getIndexPrice, getIndexTimeRangeData, getIndexHistoryLength } = require('./systems/stock_sim');
const { initEtfSystem, updateEtfHour } = require('./systems/etf_system');
const { initTaxSystem } = require('./systems/tax_system');
const { initTerminal } = require('./server/server_terminal');
const { startBucketCycle } = require('./systems/message_reference_tracker');
const { initResourceMonitor, checkResource } = require('./server/resource_monitor');
const { initScheduleManager } = require('./systems/transaction_schedule_manager');
const discord_bot = require('./discord_bot');
const { initCreditSystem, updateCreditRating } = require('./systems/credit_system');
const { initFundPriceSystem } = require('./systems/fund_price');
const { initNotificationScheduler } = require('./systems/notification_checker');
const { initMarginCallChecker } = require('./systems/margin_call_checker');
const { initAutoTradeScheduler } = require('./systems/auto_trade_scheduler');
const { initReservationChecker } = require('./systems/reservation_checker');
const { setTimezone } = require('./utils/korean_time');
const { loadKeywordsFromFile } = require('./chat_bot/message_filter');

require('dotenv').config();

module.exports = {
    async run() {
        initResourceMonitor();
        
        setTimezone();

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

        initEtfSystem({ getIndexPrice, getIndexTimeRangeData, getIndexHistoryLength });
        addHourlyListener(updateEtfHour);

        console.log('[BOOT] ETF system loaded');

        const result3b = await initFundPriceSystem();
        if (!result3b) return false;

        console.log('[BOOT] Fund price system loaded');

        const result4 = await initCreditSystem();
        if (!result4) return false;

        console.log('[BOOT] Credit system loaded');

        const result5 = await updateCreditRating();
        if (!result5) return false;

        console.log('[BOOT] Update credit success');

        const result6 = initScheduleManager();
        if (!result6) return false;

        console.log('[BOOT] Schedule Manager loaded');

        await initTaxSystem();

        console.log('[BOOT] Tax system initialized');

        const result7 = initNotificationScheduler();
        if (!result7) return false;

        console.log('[BOOT] Notification scheduler loaded');

        const result8 = initMarginCallChecker();
        if (!result8) return false;

        console.log('[BOOT] Margin call checker loaded');

        const result9 = initAutoTradeScheduler();
        if (!result9) return false;

        console.log('[BOOT] Auto-trade scheduler loaded');

        const result10 = initReservationChecker();
        if (!result10) return false;

        console.log('[BOOT] Reservation checker loaded');

        loadKeywordsFromFile();

        console.log('[BOOT] Message filter loaded');

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