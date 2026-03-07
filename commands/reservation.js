'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Reservation = require('../schemas/reservation');
const { getUserState, getAssetByAccountKey } = require('../database');
const moment = require('moment-timezone');

const TYPE_LABELS = {
    stock_buy: '주식 매수', stock_sell: '주식 매도',
    future_long: '선물 롱', future_short: '선물 숏', future_liquidate: '선물 청산',
    option_call_buy: '콜옵션 매수', option_put_buy: '풋옵션 매수',
    option_call_sell: '콜옵션 매도', option_put_sell: '풋옵션 매도',
    option_call_liquidate: '콜옵션 청산', option_put_liquidate: '풋옵션 청산',
    etf_buy: 'ETF 매수', etf_sell: 'ETF 매도',
};

const STATUS_LABELS = {
    pending: '⏳ 대기', executed: '✅ 체결', cancelled: '🚫 취소', failed: '❌ 실패',
};

function getUnit(type) {
    if (type.startsWith('future_') || type.startsWith('option_')) return '계약';
    if (type.startsWith('etf_')) return '좌';
    return '주';
}

function addConditionOptions(sub) {
    return sub
        .addIntegerOption((opt) =>
            opt.setName('조건가격')
                .setDescription('트리거 가격 (원)')
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt.setName('조건')
                .setDescription('가격 조건 방향')
                .setChoices(
                    { name: '이상 (가격 >= 조건가격)', value: 'above' },
                    { name: '이하 (가격 <= 조건가격)', value: 'below' },
                )
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt.setName('펀드')
                .setDescription('펀드 이름 (생략 시 현재 활성 계정)')
                .setRequired(false)
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('예약')
        .setDescription('가격 조건이 충족될 때 자동으로 거래를 체결합니다.')

        // ── 주식 ──────────────────────────────────────────────────────────────
        .addSubcommandGroup((group) =>
            group.setName('주식')
                .setDescription('주식 예약 주문')
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('매수')
                            .setDescription('주식 가격 조건 충족 시 자동 매수')
                            .addStringOption((opt) =>
                                opt.setName('종목').setDescription('종목 코드').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('매수 수량').setMinValue(1).setRequired(true)
                            )
                    )
                )
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('매도')
                            .setDescription('주식 가격 조건 충족 시 자동 매도')
                            .addStringOption((opt) =>
                                opt.setName('종목').setDescription('종목 코드').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('매도 수량 (0=전량)').setMinValue(0).setRequired(true)
                            )
                    )
                )
        )

        // ── 선물 ──────────────────────────────────────────────────────────────
        .addSubcommandGroup((group) =>
            group.setName('선물')
                .setDescription('선물 예약 주문')
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('롱')
                            .setDescription('선물 가격 조건 충족 시 롱 포지션 진입')
                            .addStringOption((opt) =>
                                opt.setName('종목').setDescription('종목 코드').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('계약 수').setMinValue(1).setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('레버리지').setDescription('레버리지 배율').setMinValue(1).setMaxValue(100).setRequired(true)
                            )
                    )
                )
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('숏')
                            .setDescription('선물 가격 조건 충족 시 숏 포지션 진입')
                            .addStringOption((opt) =>
                                opt.setName('종목').setDescription('종목 코드').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('계약 수').setMinValue(1).setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('레버리지').setDescription('레버리지 배율').setMinValue(1).setMaxValue(100).setRequired(true)
                            )
                    )
                )
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('청산')
                            .setDescription('선물 가격 조건 충족 시 보유 포지션 청산')
                            .addIntegerOption((opt) =>
                                opt.setName('포지션번호').setDescription('청산할 포지션 번호 (/자산으로 확인)').setMinValue(1).setRequired(true)
                            )
                    )
                )
        )

        // ── 옵션 ──────────────────────────────────────────────────────────────
        .addSubcommandGroup((group) =>
            group.setName('옵션')
                .setDescription('옵션 예약 주문')
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('매수')
                            .setDescription('옵션 가격 조건 충족 시 자동 매수')
                            .addStringOption((opt) =>
                                opt.setName('타입').setDescription('콜 또는 풋')
                                    .setChoices(
                                        { name: '콜옵션', value: 'call' },
                                        { name: '풋옵션', value: 'put' },
                                    )
                                    .setRequired(true)
                            )
                            .addStringOption((opt) =>
                                opt.setName('종목').setDescription('종목 코드').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('계약 수').setMinValue(1).setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('행사가').setDescription('행사 가격 (원)').setMinValue(1).setRequired(true)
                            )
                    )
                )
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('매도')
                            .setDescription('옵션 가격 조건 충족 시 자동 매도')
                            .addStringOption((opt) =>
                                opt.setName('타입').setDescription('콜 또는 풋')
                                    .setChoices(
                                        { name: '콜옵션', value: 'call' },
                                        { name: '풋옵션', value: 'put' },
                                    )
                                    .setRequired(true)
                            )
                            .addStringOption((opt) =>
                                opt.setName('종목').setDescription('종목 코드').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('계약 수').setMinValue(1).setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('행사가').setDescription('행사 가격 (원)').setMinValue(1).setRequired(true)
                            )
                    )
                )
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('청산')
                            .setDescription('옵션 가격 조건 충족 시 보유 포지션 청산')
                            .addIntegerOption((opt) =>
                                opt.setName('포지션번호').setDescription('청산할 포지션 번호 (/자산으로 확인)').setMinValue(1).setRequired(true)
                            )
                    )
                )
        )

        // ── ETF ───────────────────────────────────────────────────────────────
        .addSubcommandGroup((group) =>
            group.setName('etf')
                .setDescription('ETF 예약 주문')
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('매수')
                            .setDescription('ETF 가격 조건 충족 시 자동 매수')
                            .addStringOption((opt) =>
                                opt.setName('etf').setDescription('ETF ID (예: DISDAQ_1X)').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('매수 좌수').setMinValue(1).setRequired(true)
                            )
                    )
                )
                .addSubcommand((sub) =>
                    addConditionOptions(
                        sub.setName('매도')
                            .setDescription('ETF 가격 조건 충족 시 자동 매도')
                            .addStringOption((opt) =>
                                opt.setName('etf').setDescription('ETF ID (예: DISDAQ_1X)').setRequired(true)
                            )
                            .addIntegerOption((opt) =>
                                opt.setName('수량').setDescription('매도 좌수 (0=전량)').setMinValue(0).setRequired(true)
                            )
                    )
                )
        )

        // ── 관리 ──────────────────────────────────────────────────────────────
        .addSubcommandGroup((group) =>
            group.setName('관리')
                .setDescription('예약 주문 관리')
                .addSubcommand((sub) =>
                    sub.setName('목록')
                        .setDescription('대기 중인 예약 주문 목록을 표시합니다.')
                )
                .addSubcommand((sub) =>
                    sub.setName('취소')
                        .setDescription('대기 중인 예약 주문을 취소합니다.')
                        .addIntegerOption((opt) =>
                            opt.setName('번호')
                                .setDescription('예약 번호 (목록에서 확인)')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                )
        ),

    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup();
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        // ── 관리 ────────────────────────────────────────────────────────────────
        if (group === '관리') {
            if (sub === '목록') {
                const pending = await Reservation.find({ userId, status: 'pending' })
                    .sort({ createdAt: 1 });

                if (pending.length === 0) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xE57E22)
                                .setTitle('📋 예약 목록')
                                .setDescription('대기 중인 예약 주문이 없습니다.'),
                        ],
                    });
                }

                const lines = pending.map((r, i) => {
                    const condLabel = r.conditionType === 'above' ? '이상' : '이하';
                    const accountLabel = r.accountKey === '@self' ? '개인' : `${r.accountKey.replace('@fund_', '')} 펀드`;
                    const qtyStr = r.quantity != null ? ` ${r.quantity}${getUnit(r.type)}` : '';
                    const levStr = r.leverage != null ? ` (${r.leverage}x)` : '';
                    const strikeStr = r.strikePrice != null ? ` 행사가${r.strikePrice.toLocaleString()}원` : '';
                    const targetStr = r.positionNumber != null
                        ? `포지션 #${r.positionNumber} (${r.ticker})`
                        : `**${r.ticker}**`;
                    return `**${i + 1}.** \`${TYPE_LABELS[r.type]}\` ${targetStr}${qtyStr}${levStr}${strikeStr}  조건: ${r.conditionPrice.toLocaleString()}원 ${condLabel}  [${accountLabel}]`;
                });

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x3498DB)
                            .setTitle('📋 예약 목록 (대기 중)')
                            .setDescription(lines.join('\n'))
                            .setFooter({ text: `총 ${pending.length}개` })
                            .setTimestamp(),
                    ],
                });
            }

            if (sub === '취소') {
                const num = interaction.options.getInteger('번호');
                const pending = await Reservation.find({ userId, status: 'pending' })
                    .sort({ createdAt: 1 });
                const entry = pending[num - 1];

                if (!entry) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('오류')
                                .setDescription(`번호 **${num}**에 해당하는 대기 중 예약이 없습니다.`),
                        ],
                    });
                }

                entry.status = 'cancelled';
                await entry.save();

                const condLabel = entry.conditionType === 'above' ? '이상' : '이하';
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle('예약 취소')
                            .setDescription(
                                `\`${TYPE_LABELS[entry.type]}\` **${entry.ticker}** — ` +
                                `${entry.conditionPrice.toLocaleString()}원 ${condLabel} 예약이 취소되었습니다.`
                            )
                            .setTimestamp(),
                    ],
                });
            }
        }

        // ── 거래 예약 등록 ───────────────────────────────────────────────────────
        const stateResult = await getUserState(userId);
        if (stateResult.state === 'error') {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
            });
        }
        const fundName = interaction.options.getString('펀드');
        const accountKey = fundName ? `@fund_${fundName}` : stateResult.data.state.currentAccount;

        const conditionPrice = interaction.options.getInteger('조건가격');
        const conditionType = interaction.options.getString('조건');
        let type, ticker, quantity, leverage, strikePrice, positionNumber;

        if (group === '주식') {
            ticker = interaction.options.getString('종목').toUpperCase();
            quantity = interaction.options.getInteger('수량');
            type = sub === '매수' ? 'stock_buy' : 'stock_sell';
        } else if (group === '선물') {
            if (sub === '청산') {
                positionNumber = interaction.options.getInteger('포지션번호');
                const assetResult = await getAssetByAccountKey(userId, accountKey);
                if (assetResult.state !== 'success') {
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()] });
                }
                const pos = assetResult.data.futures[positionNumber - 1];
                if (!pos) {
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription(`선물 포지션 **#${positionNumber}**이 존재하지 않습니다.`)] });
                }
                ticker = pos.ticker;
                type = 'future_liquidate';
            } else {
                ticker = interaction.options.getString('종목').toUpperCase();
                quantity = interaction.options.getInteger('수량');
                leverage = interaction.options.getInteger('레버리지');
                type = sub === '롱' ? 'future_long' : 'future_short';
            }
        } else if (group === '옵션') {
            if (sub === '청산') {
                positionNumber = interaction.options.getInteger('포지션번호');
                const assetResult = await getAssetByAccountKey(userId, accountKey);
                if (assetResult.state !== 'success') {
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()] });
                }
                const pos = assetResult.data.options[positionNumber - 1];
                if (!pos) {
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription(`옵션 포지션 **#${positionNumber}**이 존재하지 않습니다.`)] });
                }
                ticker = pos.ticker;
                type = pos.optionType === 'call' ? 'option_call_liquidate' : 'option_put_liquidate';
            } else {
                const optType = interaction.options.getString('타입');
                ticker = interaction.options.getString('종목').toUpperCase();
                quantity = interaction.options.getInteger('수량');
                strikePrice = interaction.options.getInteger('행사가');
                if (sub === '매수') {
                    type = optType === 'call' ? 'option_call_buy' : 'option_put_buy';
                } else {
                    type = optType === 'call' ? 'option_call_sell' : 'option_put_sell';
                }
            }
        } else if (group === 'etf') {
            ticker = interaction.options.getString('etf').toUpperCase();
            quantity = interaction.options.getInteger('수량');
            type = sub === '매수' ? 'etf_buy' : 'etf_sell';
        }

        await Reservation.create({
            userId,
            accountKey,
            type,
            ticker,
            quantity,
            leverage,
            strikePrice,
            positionNumber,
            conditionPrice,
            conditionType,
            status: 'pending',
        });

        const condLabel = conditionType === 'above' ? '이상' : '이하';
        const accountLabel = accountKey === '@self' ? '개인 계정' : `${accountKey.replace('@fund_', '')} 펀드`;
        const qtyStr = quantity != null ? `${quantity}${getUnit(type)}` : '-';
        const targetLabel = positionNumber != null ? '포지션' : '종목';
        const targetValue = positionNumber != null ? `#${positionNumber} (\`${ticker}\`)` : `\`${ticker}\``;
        const extraFields = [];
        if (leverage != null) extraFields.push({ name: '레버리지', value: `${leverage}x`, inline: true });
        if (strikePrice != null) extraFields.push({ name: '행사가', value: `${strikePrice.toLocaleString()}원`, inline: true });

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle('✅ 예약 등록')
                    .setDescription('가격 조건이 충족되면 자동으로 체결됩니다.')
                    .addFields(
                        { name: '종류', value: TYPE_LABELS[type], inline: true },
                        { name: targetLabel, value: targetValue, inline: true },
                        { name: '수량', value: qtyStr, inline: true },
                        { name: '조건', value: `${conditionPrice.toLocaleString()}원 ${condLabel}`, inline: true },
                        { name: '계정', value: accountLabel, inline: true },
                        ...extraFields,
                    )
                    .setTimestamp(),
            ],
        });
    },
};
