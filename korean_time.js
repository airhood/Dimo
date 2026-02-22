
function getKoreanTime(date) {
    return new Date(date);
}

module.exports = {
    setTimezone: () => {
        process.env.TZ = 'Asia/Seoul';
        const date = new Date();
        console.log(`[BOOT] Timezone set complete. Current time: ${date.toString()}`);
    },
    getKoreanTime,
}