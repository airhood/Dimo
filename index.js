const app = require('./app');
const { isReady, serverLog } = require('./server/server_logger');

try {
	(async () => {
		const result = await app.run();

		if (!result) {
			safeLog(`[ERROR] Services not fully loaded.`);
		}
	})();
} catch (err) {
	safeLog(`[ERROR] Unexpected error: ${err}`);
}

function safeLog(message) {
	if (isReady()) {
		serverLog(message);
	} else {
		console.log(message);
	}
}