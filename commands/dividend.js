const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DIVIDEND_YIELDS } = require('../setting');
const { getStockPrice } = require('../systems/stock_sim');
const { getStockName } = require('../systems/stock_name');

// 한글 등 전각 문자는 2칸, 그 외는 1칸으로 계산
function vw(str) {
    let w = 0;
    for (const ch of str) {
        const c = ch.codePointAt(0);
        if (
            (c >= 0xAC00 && c <= 0xD7A3) || // 한글 음절
            (c >= 0x1100 && c <= 0x11FF) ||  // 한글 자모
            (c >= 0x3130 && c <= 0x318F) ||  // 한글 호환 자모
            (c >= 0x4E00 && c <= 0x9FFF)     // CJK
        ) {
            w += 2;
        } else {
            w += 1;
        }
    }
    return w;
}

function padR(str, n) { return str + ' '.repeat(Math.max(0, n - vw(str))); }
function padL(str, n) { return ' '.repeat(Math.max(0, n - vw(str))) + str; }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('배당금')
        .setDescription('주식별 배당 정보를 확인합니다. (배당은 3일마다 지급)'),

    async execute(interaction) {
        const entries = Object.entries(DIVIDEND_YIELDS)
            .sort((a, b) => b[1] - a[1]);

        // name 컬럼은 한글/영어 혼용이라 폰트 렌더링 차이로 정확한 공백 정렬 불가
        // │ 구분자를 사용해 컬럼 경계를 명확히 표시
        const COL = { ticker: 4, name: 20, rate: 6, price: 11 };

        const header =
            padR('티커',     COL.ticker) + ' │ ' +
            padR('종목명',   COL.name)   + ' │ ' +
            padL('배당률',   COL.rate)   + ' │ ' +
            padL('현재가격', COL.price)  + ' │ ' +
            '주당배당금';
        const sep =
            '─'.repeat(COL.ticker + 2) + '┼' +
            '─'.repeat(COL.name   + 2) + '┼' +
            '─'.repeat(COL.rate   + 2) + '┼' +
            '─'.repeat(COL.price  + 2) + '┼' +
            '─'.repeat(12);

        let rows = '';
        for (const [ticker, rate] of entries) {
            const price = getStockPrice(ticker);
            const name = getStockName(ticker) ?? ticker;
            const perShare = price !== null ? Math.round(price * (rate / 100)) : null;
            const priceStr = price !== null ? `${Math.round(price).toLocaleString()}원` : '정보없음';
            const perShareStr = perShare !== null ? `${perShare.toLocaleString()}원/주` : '-';
            const rateStr = `${rate}%`;

            rows +=
                padR(ticker,   COL.ticker) + ' │ ' +
                padR(name,     COL.name)   + ' │ ' +
                padL(rateStr,  COL.rate)   + ' │ ' +
                padL(priceStr, COL.price)  + ' │ ' +
                perShareStr + '\n';
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(':moneybag:  주식 배당금 정보')
                    .setDescription('배당은 **3일마다** 자동 지급됩니다.\n배당 기준일 이전부터 보유한 주식에만 지급됩니다.')
                    .addFields({
                        name: '종목별 배당률 (3일당)',
                        value: `\`\`\`${header}\n${sep}\n${rows}\`\`\``,
                    })
                    .setTimestamp(),
            ],
        });
    },
};
