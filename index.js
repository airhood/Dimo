const app = require('./app');
const { isReady, serverLog } = require('./server/server_logger');

try {
	(async () => {
		await app.run();
	})();
} catch (err) {
	if (isReady()) {
		serverLog(`[ERROR] Unexpected error: ${err}`);
	} else {
		console.log(`[ERROR] Unexpected error: ${err}`);
	}
}