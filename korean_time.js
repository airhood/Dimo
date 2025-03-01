module.exports = {
    getKoreanTime: () => {
        const currentDate = new Date();
        return new Date(currentDate.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    }
}