
const onProcessKillListenerList = [];

module.exports = {
    async addOnProcessKillListener(callback) {
        if (typeof callback !== 'function') {
            console.warn('Listener must be function.');
            return;
        }
        onProcessKillListenerList.push(callback);
    },

    async safeKill() {
        try {
            const result = await Promise.all(onProcessKillListenerList.map(async (callback) => {
                try {
                    await callback();
                } catch (err) {
                    console.error('Error while running safe kill callback', err);
                }
            }));
        } catch (err) {
            console.error('Error while running safe kill callback', err);
        }
    
        console.log('Safe kill success!');
        
        process.exit();
    }
}