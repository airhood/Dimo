const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserChartSettings, saveUserChartSettings, resetUserChartSettings, DEFAULT_SETTINGS } = require('../systems/chart_settings');

const VALID_INDICATORS = ['RSI', 'MACD', '볼린저밴드', '이동평균선', '이치모쿠'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('차트설정')
        .setDescription('주식 차트의 표시 설정을 관리합니다.')
        .addSubcommand((sub) =>
            sub.setName('확인')
                .setDescription('현재 차트 설정을 확인합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('차트종류')
                .setDescription('차트 종류를 설정합니다.')
                .addStringOption((opt) =>
                    opt.setName('종류')
                        .setDescription('선형 또는 캔들')
                        .setChoices(
                            { name: '선형 (Area)', value: 'area' },
                            { name: '캔들 (Candlestick)', value: 'candlestick' },
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('캔들간격')
                .setDescription('캔들차트의 봉 간격을 설정합니다 (분).')
                .addIntegerOption((opt) =>
                    opt.setName('분')
                        .setDescription('봉 간격 (1~60분)')
                        .setMinValue(1)
                        .setMaxValue(60)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('지표추가')
                .setDescription('보조지표를 추가합니다.')
                .addStringOption((opt) =>
                    opt.setName('지표')
                        .setDescription('추가할 보조지표')
                        .setChoices(
                            { name: 'RSI', value: 'RSI' },
                            { name: 'MACD', value: 'MACD' },
                            { name: '볼린저밴드', value: '볼린저밴드' },
                            { name: '이동평균선 (MA5, MA20)', value: '이동평균선' },
                            { name: '이치모쿠 구름', value: '이치모쿠' },
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('지표제거')
                .setDescription('보조지표를 제거합니다.')
                .addStringOption((opt) =>
                    opt.setName('지표')
                        .setDescription('제거할 보조지표')
                        .setChoices(
                            { name: 'RSI', value: 'RSI' },
                            { name: 'MACD', value: 'MACD' },
                            { name: '볼린저밴드', value: '볼린저밴드' },
                            { name: '이동평균선 (MA5, MA20)', value: '이동평균선' },
                            { name: '이치모쿠 구름', value: '이치모쿠' },
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('초기화')
                .setDescription('차트 설정을 기본값으로 초기화합니다.')
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subCommand === '확인') {
            const s = getUserChartSettings(userId);
            const chartTypeLabel = s.chartType === 'candlestick' ? '캔들' : '선형';
            const indStr = s.indicators.length > 0 ? s.indicators.join(', ') : '없음';

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(':bar_chart:  현재 차트 설정')
                        .setDescription(
                            `**차트 종류:** ${chartTypeLabel}\n` +
                            `**캔들 간격:** ${s.candleInterval}분봉\n` +
                            `**활성 지표:** ${indStr}`
                        )
                        .setTimestamp()
                ],
            });

        } else if (subCommand === '차트종류') {
            const kind = interaction.options.getString('종류');
            const s = getUserChartSettings(userId);
            s.chartType = kind;
            saveUserChartSettings(userId, s);

            const label = kind === 'candlestick' ? '캔들차트' : '선형차트';
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle(':white_check_mark:  차트 종류 변경')
                        .setDescription(`차트 종류가 **${label}**으로 변경되었습니다.`)
                        .setTimestamp()
                ],
            });

        } else if (subCommand === '캔들간격') {
            const interval = interaction.options.getInteger('분');
            const s = getUserChartSettings(userId);
            s.candleInterval = interval;
            saveUserChartSettings(userId, s);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle(':white_check_mark:  캔들 간격 변경')
                        .setDescription(`캔들 간격이 **${interval}분봉**으로 변경되었습니다.`)
                        .setTimestamp()
                ],
            });

        } else if (subCommand === '지표추가') {
            const indicator = interaction.options.getString('지표');
            const s = getUserChartSettings(userId);
            if (!s.indicators.includes(indicator)) {
                s.indicators.push(indicator);
                saveUserChartSettings(userId, s);
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle(':white_check_mark:  지표 추가')
                            .setDescription(`**${indicator}** 지표가 추가되었습니다.\n현재 지표: ${s.indicators.join(', ')}`)
                            .setTimestamp()
                    ],
                    });
            } else {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  지표 추가 실패')
                            .setDescription(`**${indicator}** 지표는 이미 활성화되어 있습니다.`)
                            .setTimestamp()
                    ],
                    });
            }

        } else if (subCommand === '지표제거') {
            const indicator = interaction.options.getString('지표');
            const s = getUserChartSettings(userId);
            const idx = s.indicators.indexOf(indicator);
            if (idx !== -1) {
                s.indicators.splice(idx, 1);
                saveUserChartSettings(userId, s);
                const remaining = s.indicators.length > 0 ? s.indicators.join(', ') : '없음';
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle(':white_check_mark:  지표 제거')
                            .setDescription(`**${indicator}** 지표가 제거되었습니다.\n현재 지표: ${remaining}`)
                            .setTimestamp()
                    ],
                    });
            } else {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  지표 제거 실패')
                            .setDescription(`**${indicator}** 지표는 활성화되어 있지 않습니다.`)
                            .setTimestamp()
                    ],
                    });
            }

        } else if (subCommand === '초기화') {
            resetUserChartSettings(userId);
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle(':white_check_mark:  설정 초기화')
                        .setDescription('차트 설정이 기본값으로 초기화되었습니다.')
                        .setTimestamp()
                ],
            });
        }
    },
};
