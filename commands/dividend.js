const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DIVIDEND_YIELDS } = require('../setting');
const { getStockPrice } = require('../systems/stock_sim');

function padR(str, n) { return str.padEnd(n); }
function padL(str, n) { return str.padStart(n); }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('배당금')
        .setDescription('주식별 배당 정보를 확인합니다. (배당은 3일마다 지급)'),

    async execute(interaction) {
        const entries = Object.entries(DIVIDEND_YIELDS)
            .sort((a, b) => b[1] - a[1]);

        const COL = { ticker: 4, rate: 6, price: 11 };

        let rows = '';
        for (const [ticker, rate] of entries) {
            const price = getStockPrice(ticker);
            const perShare = price !== null ? Math.round(price * (rate / 100)) : null;
            const priceStr = price !== null ? `${Math.round(price).toLocaleString()}원` : '정보없음';
            const perShareStr = perShare !== null ? `${perShare.toLocaleString()}원/주` : '-';
            const rateStr = `${rate}%`;

            rows +=
                padR(ticker,   COL.ticker) + ' │ ' +
                padL(rateStr,  COL.rate)   + ' │ ' +
                padL(priceStr, COL.price)  + ' │ ' +
                perShareStr + '\n';
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(':moneybag:  주식 배당금 정보 (3일당)')
                    .setDescription(`\`\`\`${rows}\`\`\``)
                    .setFooter({ text: '배당은 3일마다 자동 지급 · 기준일 이전 보유분에만 지급' })
                    .setTimestamp(),
            ],
        });
    },
};
