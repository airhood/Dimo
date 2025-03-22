const schedule = require('node-schedule');
const { serverLog } = require('./server_logger');

const MEMORY_THRESHOLD = 250 * 1024 * 1024;

module.exports = {
    initResourceMonitor() {        
        schedule.scheduleJob('*/30 * * * *', () => {
            const memoryUsageVal = module.exports.memoryUsage();
            if (memoryUsageVal > MEMORY_THRESHOLD) {
                serverLog(`[ERROR] High server memory usage.\nMemory Usage: ${memoryUsageVal}`);
            }
        });
    },

    checkResource() {
        const memoryUsageVal = module.exports.memoryUsage();
        if (memoryUsageVal > MEMORY_THRESHOLD) {
            serverLog(`[ERROR] High server memory usage.\nMemory Usage: ${memoryUsageVal}`);
            return false;
        }
        return true;
    },

    memoryUsage() {
        const memoryData = process.memoryUsage();
        return memoryData.rss;
    }
}