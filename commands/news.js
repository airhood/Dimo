const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserAsset, addBalance, checkUserExists, addTransactionLog } = require('../database');
const {
    getPremiumNewsList,
    getPremiumNewsById,
    hasBought,
    purchaseNews,
    getFreeNews,
} = require('../stock_system/news_system');
const { getStockName } = require('../stock_system/stock_name');

const TIER_STARS = ['', '★☆☆☆', '★★☆☆', '★★★☆', '★★★★'];
const TIER_LABELS = ['', '시장 소문', '시장 정보', '선행 정보', '내부 정보'];
const TIER_COLORS = [0, 0x95A5A6, 0xF1C40F, 0xE67E22, 0xE74C3C];

function tierBadge(tier) {
    return `${TIER_STARS[tier]} ${TIER_LABELS[tier]}`;
}

function formatPrice(p) {
    return `${p.toLocaleString()}원`;
}

function directionText(direction) {
    return direction === 'up' ? '📈 상승' : '📉 하락';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('뉴스')
        .setDescription('주식 뉴스를 확인합니다.')
        .addSubcommand(sub =>
            sub.setName('무료')
                .setDescription('무료 시장 소문을 확인합니다.')
        )
        .addSubcommand(sub =>
            sub.setName('프리미엄')
                .setDescription('프리미엄 뉴스 목록을 확인합니다.')
        )
        .addSubcommand(sub =>
            sub.setName('구매')
                .setDescription('프리미엄 뉴스를 구매합니다.')
                .addIntegerOption(opt =>
                    opt.setName('번호')
                        .setDescription('구매할 뉴스 번호')
                        .setRequired(true)
                        .setMinValue(1)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // ── /뉴스 무료 ────────────────────────────────────────────────────────
        if (sub === '무료') {
            const lines = getFreeNews();

            if (lines.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x95A5A6)
                            .setTitle('📰 무료 시장 소문')
                            .setDescription('현재 시간대에 소문이 없습니다.')
                    ],
                });
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle('📰 무료 시장 소문')
                        .setDescription(lines.join('\n'))
                        .setFooter({ text: '⚠ 시장 소문은 부정확할 수 있습니다.' })
                ],
            });
        }

        // ── /뉴스 프리미엄 ────────────────────────────────────────────────────
        if (sub === '프리미엄') {
            const userId = interaction.user.id;
            const list = getPremiumNewsList();

            if (list.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x95A5A6)
                            .setTitle('🔐 프리미엄 뉴스')
                            .setDescription('현재 판매 중인 프리미엄 뉴스가 없습니다.')
                    ],
                });
            }

            const fields = list.map((item, i) => {
                const stockName = getStockName(item.ticker);
                const typeTag = item.isForward ? '🔮 선행' : '📰 회고';
                const boughtTag = hasBought(userId, item.id) ? ' ✅ 구매완료' : '';
                return {
                    name: `${i + 1}. ${stockName} [${item.ticker}]${boughtTag}`,
                    value: `${tierBadge(item.tier)} · ${typeTag}\n💰 ${formatPrice(item.price)}`,
                    inline: true,
                };
            });

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xE67E22)
                        .setTitle('🔐 프리미엄 뉴스')
                        .setDescription('번호로 구매하세요. 선행 정보는 다음 시간 주가 움직임을 예측합니다.')
                        .addFields(fields)
                        .setFooter({ text: '/뉴스 구매 [번호]' })
                ],
            });
        }

        // ── /뉴스 구매 ────────────────────────────────────────────────────────
        if (sub === '구매') {
            const userId = interaction.user.id;
            const index = interaction.options.getInteger('번호');

            await interaction.deferReply({ ephemeral: true });

            // Check user exists
            const existsResult = await checkUserExists(userId);
            if (existsResult.state === 'error' || !existsResult.data) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(':x: 오류')
                            .setDescription('등록된 계정이 없습니다.')
                    ],
                });
            }

            const list = getPremiumNewsList();
            const item = list[index - 1];

            if (!item) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(':x: 뉴스 없음')
                            .setDescription(`${index}번 뉴스가 존재하지 않습니다.`)
                    ],
                });
            }

            if (hasBought(userId, item.id)) {
                return interaction.editReply({
                    embeds: [buildPurchasedEmbed(item)],
                });
            }

            // Check balance
            const assetResult = await getUserAsset(userId);
            if (assetResult.state !== 'success') {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(':x: 오류')
                            .setDescription('자산 정보를 불러올 수 없습니다.')
                    ],
                });
            }

            const balance = assetResult.data.asset
                ? assetResult.data.asset.balance
                : assetResult.data.balance;

            if (balance < item.price) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(':x: 잔액 부족')
                            .setDescription(`잔액이 부족합니다.\n필요: **${formatPrice(item.price)}** / 보유: **${formatPrice(balance)}**`)
                    ],
                });
            }

            // Deduct balance
            const deductResult = await addBalance(userId, -item.price);
            if (deductResult.state !== 'success') {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(':x: 결제 실패')
                            .setDescription('결제 처리 중 오류가 발생했습니다.')
                    ],
                });
            }

            addTransactionLog(userId, 'news_buy', `뉴스 구매: ${getStockName(item.ticker)} [${item.ticker}] ${TIER_LABELS[item.tier]} (${formatPrice(item.price)})`);

            purchaseNews(userId, item.id);

            return interaction.editReply({
                embeds: [buildPurchasedEmbed(item)],
            });
        }
    }
};

function buildPurchasedEmbed(item) {
    const stockName = getStockName(item.ticker);
    const dirText = directionText(item.direction);
    const typeTag = item.isForward ? '🔮 선행 정보 (다음 시간 예측)' : '📰 회고 정보 (지난 시간 기록)';
    const color = TIER_COLORS[item.tier];
    const expireTs = Math.floor(item.expiresAt.getTime() / 1000);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🔓 ${stockName} [${item.ticker}] 뉴스 구매 완료`)
        .addFields(
            { name: '등급', value: tierBadge(item.tier), inline: true },
            { name: '유형', value: typeTag, inline: true },
            { name: '방향', value: dirText, inline: true },
            { name: '변동폭', value: `${item.magnitude.toFixed(1)}%`, inline: true },
            { name: '만료', value: `<t:${expireTs}:R>`, inline: true },
        );

    if (item.headline) {
        embed.setDescription(`> ${item.headline}`);
    }

    return embed;
}
