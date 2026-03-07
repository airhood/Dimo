const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { buyBond, sellBond, getUserBonds } = require('../database');
const {
    FACE_VALUE, getBondYield, getYieldCurve,
    calcMaturityValue, calcMarketPrice,
    generateBondChart, generateYieldCurveChart,
} = require('../systems/bond_system');

const PRODUCTS = { '3': 3, '7': 7, '14': 14, '21': 21 };

function fmt(n) { return Math.round(n).toLocaleString(); }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('채권')
        .setDescription('국채를 매수/매도하고 금리를 확인합니다.')
        .addSubcommand((sub) =>
            sub.setName('금리')
                .setDescription('만기별 현재 국채 수익률을 확인합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('금리차트')
                .setDescription('3일·7일·14일물 수익률 추이 차트를 확인합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('금리커브')
                .setDescription('현재 수익률 커브(금리 커브) 차트를 확인합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('매수')
                .setDescription('국채를 매수합니다. (1매 = 100만원, 만기 시 액면가 + 이자 지급)')
                .addStringOption((opt) =>
                    opt.setName('상품')
                        .setDescription('국채 만기')
                        .setRequired(true)
                        .addChoices(
                            { name: '3일물', value: '3' },
                            { name: '7일물', value: '7' },
                            { name: '14일물', value: '14' },
                            { name: '21일물', value: '21' },
                        )
                )
                .addIntegerOption((opt) =>
                    opt.setName('수량')
                        .setDescription('매수할 국채 수량 (1매 = 100만원)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(1000)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('매도')
                .setDescription('보유 국채를 중도 매각합니다. (채권금리 변동에 따라 손익 발생)')
                .addIntegerOption((opt) =>
                    opt.setName('번호')
                        .setDescription('매도할 채권 번호 (/채권 현황 에서 확인)')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('현황')
                .setDescription('보유 국채 목록과 현재 평가손익을 확인합니다.')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // ── 금리 ───────────────────────────────────────────────────────────
        if (sub === '금리') {
            const curve = getYieldCurve();
            const fields = curve.map(c => ({
                name: `${c.maturity}일물`,
                value: `\`${c.yield}%\``,
                inline: true,
            }));
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('국채 수익률')
                        .addFields(...fields)
                        .setFooter({ text: '채권수익률은 분마다 변동됩니다.' })
                        .setTimestamp(),
                ],
            });

        // ── 금리차트 ────────────────────────────────────────────────────────
        } else if (sub === '금리차트') {
            await interaction.deferReply();
            const chartBuffer = await generateBondChart();
            const attachment  = new AttachmentBuilder(chartBuffer, { name: 'bond_chart.png' });
            const curve = getYieldCurve().filter(c => [3, 7, 14, 21].includes(c.maturity));
            const fields = curve.map(c => ({ name: `${c.maturity}일물`, value: `\`${c.yield}%\``, inline: true }));
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('국채 수익률 추이 차트 (최근 2시간)')
                        .addFields(...fields)
                        .setImage('attachment://bond_chart.png')
                        .setTimestamp(),
                ],
                files: [attachment],
            });

        // ── 금리커브 ────────────────────────────────────────────────────────
        } else if (sub === '금리커브') {
            await interaction.deferReply();
            const chartBuffer = await generateYieldCurveChart();
            const attachment  = new AttachmentBuilder(chartBuffer, { name: 'yield_curve.png' });
            const curve = getYieldCurve();

            // 커브 형태 판단
            const ylds = curve.map(c => c.yield);
            const isNormal   = ylds[ylds.length - 1] > ylds[0];
            const isInverted = ylds[ylds.length - 1] < ylds[0];
            const shape = isNormal ? '정상 (우상향)' : isInverted ? '역전 (우하향)' : '플랫';

            const fields = curve.map(c => ({ name: `${c.maturity}일물`, value: `\`${c.yield}%\``, inline: true }));

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('국채 수익률 커브')
                        .setDescription(`커브 형태: **${shape}**`)
                        .addFields(...fields)
                        .setImage('attachment://yield_curve.png')
                        .setTimestamp(),
                ],
                files: [attachment],
            });

        // ── 매수 ───────────────────────────────────────────────────────────
        } else if (sub === '매수') {
            const productStr  = interaction.options.getString('상품');
            const quantity    = interaction.options.getInteger('수량');
            const maturityDays = PRODUCTS[productStr];
            const totalCost   = FACE_VALUE * quantity;

            const result = await buyBond(interaction.user.id, maturityDays, quantity);

            if (result.state === 'no_balance') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  채권 매수 실패')
                            .setDescription(`잔액이 부족합니다.\n필요 금액: **${fmt(totalCost)}원**`),
                    ],
                });
            } else if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류')
                            .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 문의해주세요.')
                            .setTimestamp(),
                    ],
                });
            } else {
                const { couponRate, maturityValue: mv } = result.data;
                const interest = mv - totalCost;
                const maturityDate = new Date();
                maturityDate.setDate(maturityDate.getDate() + maturityDays);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle(':white_check_mark:  국채 매수 완료')
                            .addFields(
                                { name: '상품',       value: `${maturityDays}일물`,  inline: true },
                                { name: '수량',       value: `${quantity}매`,         inline: true },
                                { name: '표면금리',   value: `\`${couponRate}%\``,    inline: true },
                                { name: '매수금액',   value: `${fmt(totalCost)}원`,   inline: true },
                                { name: '만기수령액', value: `${fmt(mv)}원`,          inline: true },
                                { name: '이자수익',   value: `+${fmt(interest)}원`,   inline: true },
                                { name: '만기일', value: maturityDate.toLocaleDateString('ko-KR') },
                            )
                            .setTimestamp(),
                    ],
                });
            }

        // ── 매도 ───────────────────────────────────────────────────────────
        } else if (sub === '매도') {
            const number = interaction.options.getInteger('번호');

            const bondsResult = await getUserBonds(interaction.user.id);
            if (bondsResult.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류')
                            .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 문의해주세요.')
                            .setTimestamp(),
                    ],
                });
                return;
            }

            const sorted = [...bondsResult.data].sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));
            const target = sorted[number - 1];

            if (!target) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  채권 매도 실패')
                            .setDescription(`${number}번 채권이 존재하지 않습니다.`),
                    ],
                });
                return;
            }

            const result = await sellBond(interaction.user.id, target.uid);

            if (result.state === 'not_found') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  채권 매도 실패')
                            .setDescription(`${number}번 채권이 존재하지 않습니다.`),
                    ],
                });
            } else if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류')
                            .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 문의해주세요.')
                            .setTimestamp(),
                    ],
                });
            } else {
                const { marketValue, gain } = result.data;
                const gainStr = gain >= 0 ? `+${fmt(gain)}원` : `-${fmt(Math.abs(gain))}원`;
                const embedColor = gain > 0 ? 0x2ECC71 : gain < 0 ? 0xEA4144 : 0xF1C40F;

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(embedColor)
                            .setTitle(':white_check_mark:  국채 중도 매각 완료')
                            .addFields(
                                { name: '매각금액', value: `${fmt(marketValue)}원`, inline: true },
                                { name: '손익',     value: gainStr,                inline: true },
                            )
                            .setTimestamp(),
                    ],
                });
            }

        // ── 현황 ───────────────────────────────────────────────────────────
        } else if (sub === '현황') {
            const result = await getUserBonds(interaction.user.id);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류')
                            .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 문의해주세요.')
                            .setTimestamp(),
                    ],
                });
                return;
            }

            const bonds = result.data;
            if (bonds.length === 0) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle('보유 국채 현황')
                            .setDescription('보유 중인 국채가 없습니다.'),
                    ],
                });
                return;
            }

            const now = new Date();
            const sorted = [...bonds].sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));

            let totalCost = 0;
            let totalMarket = 0;
            const lines = sorted.map((bond, i) => {
                const currentYld = getBondYield(bond.maturityDays);
                const daysHeld   = Math.max(0, Math.floor((now - new Date(bond.purchaseDate)) / (1000 * 60 * 60 * 24)));
                const marketPerUnit = calcMarketPrice(bond.faceValue, bond.couponRate, bond.maturityDays, daysHeld, currentYld);
                const market = marketPerUnit * bond.quantity;
                const cost   = bond.faceValue * bond.quantity;
                const gain   = market - cost;
                const gainStr = gain >= 0 ? `+${fmt(gain)}` : `-${fmt(Math.abs(gain))}`;
                const matDate = new Date(bond.maturityDate).toLocaleDateString('ko-KR');

                totalCost   += cost;
                totalMarket += market;

                return `${i + 1}. ${bond.maturityDays}일물 ${bond.quantity}매 | 표면금리 ${bond.couponRate}% | 만기 ${matDate}\n   매수 ${fmt(cost)}원 → 평가 ${fmt(market)}원 (${gainStr}원)`;
            });

            const totalGain    = totalMarket - totalCost;
            const totalGainStr = totalGain >= 0 ? `+${fmt(totalGain)}원` : `-${fmt(Math.abs(totalGain))}원`;

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('보유 국채 현황')
                        .setDescription(`\`\`\`${lines.join('\n')}\`\`\``)
                        .addFields(
                            { name: '총 매수금액', value: `${fmt(totalCost)}원`,   inline: true },
                            { name: '총 평가금액', value: `${fmt(totalMarket)}원`, inline: true },
                            { name: '총 평가손익', value: totalGainStr,             inline: true },
                        )
                        .setTimestamp(),
                ],
            });
        }
    },
};
