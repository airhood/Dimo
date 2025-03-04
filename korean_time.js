module.exports = {
    getKoreanTime: (date) => {
        return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    }
}