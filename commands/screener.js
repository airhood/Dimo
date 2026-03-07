'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getStockList } = require('../systems/stock_sim');

function fmtPrice(n) {
    return Math.round(n).toLocaleString() + '원';
}

function fmtPct(pct) {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('스크리너')
        .setDescription('조건에 맞는 주식 종목을 필터링합니다.')
        .addStringOption((opt) =>
            opt.setName('변동')
                .setDescription('상승/하락 필터')
                .setChoices(
                    { name: '전체', value: '전체' },
                    { name: '상승', value: '상승' },
                    { name: '하락', value: '하락' },
                )
                .setRequired(false)
        )
        .addIntegerOption((opt) =>
            opt.setName('최소가격')
                .setDescription('최소 주식 가격 (원)')
                .setMinValue(0)
                .setRequired(false)
        )
        .addIntegerOption((opt) =>
            opt.setName('최대가격')
                .setDescription('최대 주식 가격 (원)')
                .setMinValue(0)
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt.setName('정렬')
                .setDescription('정렬 기준')
                .setChoices(
                    { name: '상승순', value: '상승순' },
                    { name: '하락순', value: '하락순' },
                    { name: '가격순(높은)', value: '가격순(높은)' },
                    { name: '가격순(낮은)', value: '가격순(낮은)' },
                )
                .setRequired(false)
        ),

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

        const changeFilter = interaction.options.getString('변동') ?? '전체';
        const minPrice = interaction.options.getInteger('최소가격');
        const maxPrice = interaction.options.getInteger('최대가격');
        const sort = interaction.options.getString('정렬') ?? '상승순';

        const withPct = list.map(s => {
            const prevPrice = s.price - s.difference;
            const pct = prevPrice !== 0 ? (s.difference / prevPrice) * 100 : 0;
            return { ...s, pct };
        });

        let filtered = withPct;
        if (changeFilter === '상승') filtered = filtered.filter(s => s.pct > 0);
        else if (changeFilter === '하락') filtered = filtered.filter(s => s.pct < 0);
        if (minPrice !== null) filtered = filtered.filter(s => s.price >= minPrice);
        if (maxPrice !== null) filtered = filtered.filter(s => s.price <= maxPrice);

        if (sort === '상승순') filtered.sort((a, b) => b.pct - a.pct);
        else if (sort === '하락순') filtered.sort((a, b) => a.pct - b.pct);
        else if (sort === '가격순(높은)') filtered.sort((a, b) => b.price - a.price);
        else if (sort === '가격순(낮은)') filtered.sort((a, b) => a.price - b.price);

        if (filtered.length === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle('📋 스크리너')
                        .setDescription('조건에 맞는 종목이 없습니다.'),
                ],
            });
        }

        const display = filtered.slice(0, 20);
        const lines = display.map(s =>
            `\`${s.ticker}\`  **${fmtPrice(s.price)}**  ${fmtPct(s.pct)}`
        );

        const filterParts = [];
        if (changeFilter !== '전체') filterParts.push(changeFilter);
        if (minPrice !== null) filterParts.push(`최소 ${minPrice.toLocaleString()}원`);
        if (maxPrice !== null) filterParts.push(`최대 ${maxPrice.toLocaleString()}원`);
        const filterDesc = filterParts.length > 0 ? filterParts.join(', ') : '전체';

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('📋 스크리너')
            .addFields({
                name: `${sort} · ${filterDesc}`,
                value: lines.join('\n'),
            })
            .setFooter({ text: `${filtered.length}개 종목 해당 (최대 20개 표시)` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
