const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { payTax, getTaxRecord, calculateTax, TAX_FLOOR, BRACKETS } = require('../systems/tax_system');

function formatWon(n) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}조원`;
    if (abs >= 100_000_000)       return `${(n / 100_000_000).toFixed(1)}억원`;
    return `${Math.round(n).toLocaleString()}원`;
}

function bracketSummary() {
    const lines = [
        `주간 증가분 100억 미만 — 면세`,
        `100억 ~ 500억 — 1%`,
        `500억 ~ 1,000억 — 2%`,
        `1,000억 ~ 5,000억 — 3%`,
        `5,000억 ~ 1조 — 5%`,
        `1조 초과 — 7%`,
    ];
    return lines.join('\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('세금')
        .setDescription('재산세 관련 명령어')
        .addSubcommand(sub =>
            sub.setName('납부')
                .setDescription('이번 주 재산세를 납부합니다.')
        )
        .addSubcommand(sub =>
            sub.setName('조회')
                .setDescription('이번 주 재산세 고지 내용을 확인합니다.')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (sub === '조회') {
            const record = await getTaxRecord(userId);

            if (!record) {
                return interaction.reply({
                    ephemeral: true,
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle('💰 재산세 조회')
                            .setDescription('현재 고지된 재산세가 없습니다.\n저번 주 대비 **증가분이 100억 미만**이거나 아직 고지 전입니다.')
                            .addFields({ name: '과세 구간', value: bracketSummary() })
                    ],
                });
            }

            const dueTs = Math.floor(record.dueDate.getTime() / 1000);
            const color = record.paid ? 0x2ECC71 : 0xE74C3C;
            const statusText = record.paid
                ? '✅ 납부 완료'
                : `⚠️ 미납 — <t:${dueTs}:R> 까지 납부 (이후 강제 징수)`;

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(color)
                        .setTitle('💰 재산세 고지서')
                        .addFields(
                            { name: '현재 총자산', value: formatWon(record.totalAssets), inline: true },
                            { name: '과세 증가분', value: formatWon(record.taxableGain), inline: true },
                            { name: '세액', value: formatWon(record.taxAmount), inline: true },
                            { name: '납부 기한', value: `<t:${dueTs}:F>`, inline: true },
                            { name: '상태', value: statusText },
                        )
                ],
            });
        }

        if (sub === '납부') {
            await interaction.deferReply({});

            const result = await payTax(userId);

            if (result.state === 'no_record') {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle('💰 재산세 납부')
                            .setDescription('고지된 재산세가 없습니다.')
                    ],
                });
            }

            if (result.state === 'already_paid') {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle('💰 재산세 납부')
                            .setDescription(`이미 납부 완료한 세금입니다. (${formatWon(result.taxAmount)})`)
                    ],
                });
            }

            if (result.state === 'no_balance') {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(':x: 잔액 부족')
                            .setDescription(
                                `잔액이 부족합니다.\n` +
                                `납부액: **${formatWon(result.taxAmount)}**\n` +
                                `보유 현금: **${formatWon(result.balance)}**\n\n` +
                                `납부일까지 납부하지 않으면 보유 현금에서 강제 징수됩니다.`
                            )
                    ],
                });
            }

            if (result.state === 'error') {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(':x: 오류')
                            .setDescription('세금 납부 중 오류가 발생했습니다.')
                    ],
                });
            }

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle('💰 재산세 납부 완료')
                        .setDescription(`**${formatWon(result.taxAmount)}** 납부 완료했습니다.`)
                ],
            });
        }
    }
};
