const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getEtfList, getEtfInfo, getEtfTimeRangeData, ETF_DEFINITIONS } = require('../systems/etf_system');
const { generateIndexChartImage } = require('../systems/stock_chart');
const { etfBuy, etfSell } = require('../database');
const { serverLog } = require('../server/server_logger');
const fs = require('fs');

const ETF_CHOICES = Object.values(ETF_DEFINITIONS).map(def => ({
    name: def.name,
    value: def.id,
}));

function formatPrice(n) {
    return n.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('etf')
        .setDescription('ETF (상장지수펀드) 관련 명령어입니다.')
        .addSubcommand((sub) =>
            sub.setName('목록')
                .setDescription('거래 가능한 ETF 목록을 확인합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('가격')
                .setDescription('ETF의 현재 가격 정보를 확인합니다.')
                .addStringOption((opt) =>
                    opt.setName('etf명')
                        .setDescription('확인할 ETF')
                        .addChoices(...ETF_CHOICES)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('차트')
                .setDescription('ETF 차트를 확인합니다.')
                .addStringOption((opt) =>
                    opt.setName('etf명')
                        .setDescription('확인할 ETF')
                        .addChoices(...ETF_CHOICES)
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt.setName('일')
                        .setDescription('조회할 기간 (일)')
                        .setMinValue(0)
                        .setRequired(false)
                )
                .addIntegerOption((opt) =>
                    opt.setName('시간')
                        .setDescription('조회할 기간 (시간)')
                        .setMinValue(0)
                        .setRequired(false)
                )
                .addIntegerOption((opt) =>
                    opt.setName('분')
                        .setDescription('조회할 기간 (분)')
                        .setMinValue(0)
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('매수')
                .setDescription('ETF를 매수합니다.')
                .addStringOption((opt) =>
                    opt.setName('etf명')
                        .setDescription('매수할 ETF')
                        .addChoices(...ETF_CHOICES)
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt.setName('수량')
                        .setDescription('매수할 수량 (0 입력시 올인)')
                        .setMinValue(0)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('매도')
                .setDescription('ETF를 매도합니다.')
                .addStringOption((opt) =>
                    opt.setName('etf명')
                        .setDescription('매도할 ETF')
                        .addChoices(...ETF_CHOICES)
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt.setName('수량')
                        .setDescription('매도할 수량 (0 입력시 전량)')
                        .setMinValue(0)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === '목록') {
            const list = getEtfList();
            if (!list || list.length === 0) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('ETF 목록 불러오기 실패')
                            .setDescription('ETF 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.')
                    ],
                });
                return;
            }

            const etf_list_format = list.map(etf => {
                const price = etf.price ?? 0;
                const nav = etf.nav ?? price;
                const intradayReturn = nav > 0 ? (price - nav) / nav : 0;
                const pct = (intradayReturn * 100).toFixed(2);
                const priceStr = formatPrice(price);
                const pctSign = intradayReturn > 0 ? '+' : '';
                const lev = etf.leverage > 0 ? `+${etf.leverage}x` : `${etf.leverage}x`;

                let color;
                if (intradayReturn > 0) color = '+';
                else if (intradayReturn < 0) color = '-';
                else color = '=';

                return `${etf.name} (${lev})\n\`\`\`diff\n${color} ${priceStr}원 (${pctSign}${pct}%)\n\`\`\``;
            });

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(':bar_chart:  ETF 목록')
                        .setDescription(etf_list_format.join('\n'))
                        .setTimestamp()
                ],
            });

        } else if (subCommand === '가격') {
            const etfId = interaction.options.getString('etf명');
            const info = getEtfInfo(etfId);

            if (!info) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('ETF 불러오기 실패')
                            .setDescription('존재하지 않는 ETF입니다.')
                    ],
                });
                return;
            }

            const lev = info.leverage > 0 ? `+${info.leverage}x` : `${info.leverage}x`;
            const priceStr = info.price != null ? formatPrice(info.price) + '원' : '-';
            const navStr = info.nav != null ? formatPrice(info.nav) + '원' : '-';

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(`[${info.shortName}]  ${info.name}`)
                        .addFields(
                            { name: '현재가', value: `\`\`\`${priceStr}\`\`\``, inline: true },
                            { name: 'NAV (기준가)', value: `\`\`\`${navStr}\`\`\``, inline: true },
                            { name: '레버리지', value: `\`\`\`${lev}\`\`\``, inline: true },
                            { name: '리밸런싱까지', value: `\`\`\`${info.hoursUntilRebalance}시간\`\`\``, inline: true },
                        )
                        .setTimestamp()
                ],
            });

        } else if (subCommand === '차트') {
            const etfId = interaction.options.getString('etf명');

            let days = interaction.options.getInteger('일');
            let hours = interaction.options.getInteger('시간');
            let minutes = interaction.options.getInteger('분');

            if (days === null && hours === null && minutes === null) {
                days = 0; hours = 6; minutes = 0;
            } else {
                if (days === null) days = 0;
                if (hours === null) hours = 0;
                if (minutes === null) minutes = 0;
            }

            const info = getEtfInfo(etfId);
            if (!info) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('ETF 불러오기 실패')
                            .setDescription('존재하지 않는 ETF입니다.')
                    ],
                });
                return;
            }

            const timeRangeData = getEtfTimeRangeData(etfId, (days * 24) + hours, minutes);
            if (!timeRangeData || timeRangeData.length === 0) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('데이터 없음')
                            .setDescription('아직 ETF 데이터가 없습니다. 잠시 후 다시 시도해주세요.')
                    ],
                });
                return;
            }

            try {
                const result = await generateIndexChartImage(info.shortName, timeRangeData);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`:chart_with_upwards_trend:  ${info.shortName} 차트`)
                            .setImage(`attachment://${result.filename}`)
                    ],
                    files: [{
                        attachment: result.filepath,
                        name: result.filename,
                    }],
                });

                try {
                    fs.unlink(result.filepath, (err) => {
                        if (err) serverLog(`[ERROR] Error deleting ETF chart file: ${err}`);
                    });
                } catch (err) {
                    serverLog(`[ERROR] Error deleting ETF chart file: ${err}`);
                }
            } catch (err) {
                serverLog(`[ERROR] Error generating ETF chart: ${err}`);
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.')
                            .setTimestamp()
                    ],
                });
            }

        } else if (subCommand === '매수') {
            const etfId = interaction.options.getString('etf명');
            const quantity = interaction.options.getInteger('수량');

            const result = await etfBuy(interaction.user.id, etfId, quantity);

            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.')
                            .setTimestamp()
                    ],
                });
            } else if (result.state === 'no_balance') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription('잔액이 부족합니다.')
                            .setTimestamp()
                    ],
                });
            } else if (result.state === 'success') {
                const def = ETF_DEFINITIONS[etfId];
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  주문 체결 완료')
                            .setDescription(`${def.name} ${result.data.toLocaleString()}좌 매수 주문이 체결되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }

        } else if (subCommand === '매도') {
            const etfId = interaction.options.getString('etf명');
            const quantity = interaction.options.getInteger('수량');

            const result = await etfSell(interaction.user.id, etfId, quantity);

            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.')
                            .setTimestamp()
                    ],
                });
            } else if (result.state === 'no_etf') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription('보유 ETF가 부족합니다.')
                            .setTimestamp()
                    ],
                });
            } else if (result.state === 'success') {
                const def = ETF_DEFINITIONS[etfId];
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  주문 체결 완료')
                            .setDescription(`${def.name} ${result.data.toLocaleString()}좌 매도 주문이 체결되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }
        }
    }
};
