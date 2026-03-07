'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getStockList, getIndexPrice } = require('../systems/stock_sim');

function fmtPrice(n) {
    return Math.round(n).toLocaleString() + '원';
}

function fmtPct(pct) {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('시장요약')
        .setDescription('현재 시장 현황: 지수, 상위 상승/하락 종목을 표시합니다.'),

    async execute(interaction) {
        const list = getStockList();
        if (!list || list.length === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('데이터 없음')
                        .setDescription('아직 시장 데이터가 없습니다. 잠시 후 다시 시도해주세요.')
                ],
            });
        }

        // 전시간 대비 등락률 계산
        const withPct = list.map(s => {
            const prevPrice = s.price - s.difference;
            const pct = prevPrice !== 0 ? (s.difference / prevPrice) * 100 : 0;
            return { ...s, pct };
        });

        const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
        const gainers = sorted.slice(0, 5);
        const losers = sorted.slice(-5).reverse();

        const indexPrice = getIndexPrice();

        const gainerLines = gainers.map(s =>
            `\`${s.ticker}\`  **${fmtPrice(s.price)}**  ${fmtPct(s.pct)}`
        );
        const loserLines = losers.map(s =>
            `\`${s.ticker}\`  **${fmtPrice(s.price)}**  ${fmtPct(s.pct)}`
        );

        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('📊 시장 요약')
            .addFields(
                {
                    name: '📈 DISDAQ 지수',
                    value: indexPrice != null ? `\`${Math.round(indexPrice).toLocaleString()}\`` : '`-`',
                    inline: false,
                },
                {
                    name: '🚀 상위 상승 종목',
                    value: gainerLines.join('\n') || '-',
                    inline: true,
                },
                {
                    name: '📉 상위 하락 종목',
                    value: loserLines.join('\n') || '-',
                    inline: true,
                },
            )
            .setFooter({ text: `총 ${list.length}개 종목` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
