const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDISDAQIndex, getDISDAQIndexTimeRangeData } = require('../systems/stock_index_system');
const { generateIndexChartImage } = require('../systems/stock_chart');
const { serverLog } = require('../server/server_logger');
const fs = require('fs');

const INDEX_CHOICES = [
    { name: 'DISDAQ', value: 'DISDAQ' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('지수')
        .setDescription('주가 지수를 확인합니다.')
        .addSubcommand((sub) =>
            sub.setName('현재가')
                .setDescription('현재 지수값을 확인합니다.')
                .addStringOption((opt) =>
                    opt.setName('지수명')
                        .setDescription('불러올 지수의 이름')
                        .addChoices(...INDEX_CHOICES)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('차트')
                .setDescription('지수 차트를 확인합니다.')
                .addStringOption((opt) =>
                    opt.setName('지수명')
                        .setDescription('불러올 지수의 이름')
                        .addChoices(...INDEX_CHOICES)
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
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const indicator = interaction.options.getString('지수명');

        if (subCommand === '현재가') {
            switch (indicator) {
                case 'DISDAQ': {
                    const indicatorValue = getDISDAQIndex();
                    const formatted = indicatorValue.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');

                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xF1C40F)
                                .setTitle(`[DISDAQ]`)
                                .setDescription(`\`\`\`${formatted}원\`\`\``)
                                .setTimestamp()
                        ],
                    });
                    break;
                }
                default:
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('지수 불러오기 실패')
                                .setDescription('존재하지 않는 지수입니다.')
                        ],
                    });
            }

        } else if (subCommand === '차트') {
            let days = interaction.options.getInteger('일');
            let hours = interaction.options.getInteger('시간');
            let minutes = interaction.options.getInteger('분');

            if (days === null && hours === null && minutes === null) {
                days = 0;
                hours = 6;
                minutes = 0;
            } else {
                if (days === null) days = 0;
                if (hours === null) hours = 0;
                if (minutes === null) minutes = 0;
            }

            let getTimeRangeData;
            switch (indicator) {
                case 'DISDAQ':
                    getTimeRangeData = () => getDISDAQIndexTimeRangeData((days * 24) + hours, minutes);
                    break;
                default:
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('지수 불러오기 실패')
                                .setDescription('존재하지 않는 지수입니다.')
                        ],
                    });
                    return;
            }

            const timeRangeData = getTimeRangeData();
            if (timeRangeData.length === 0) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('데이터 없음')
                            .setDescription('아직 지수 데이터가 없습니다. 잠시 후 다시 시도해주세요.')
                    ],
                });
                return;
            }

            try {
                const result = await generateIndexChartImage(indicator, timeRangeData);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`:chart_with_upwards_trend:  ${indicator} 차트`)
                            .setImage(`attachment://${result.filename}`)
                    ],
                    files: [{
                        attachment: result.filepath,
                        name: result.filename,
                    }],
                });

                try {
                    fs.unlink(result.filepath, (err) => {
                        if (err) serverLog(`[ERROR] Error deleting chart image file: ${err}`);
                    });
                } catch (err) {
                    serverLog(`[ERROR] Error deleting chart image file: ${err}`);
                }
            } catch (err) {
                serverLog(`[ERROR] Error generating index chart: ${err}`);
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
        }
    }
};
