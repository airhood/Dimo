const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { tryGetTicker, getTickerList, getTimeRangeData } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');
const { checkUserExists } = require('../database');
const { generateStockChartImage } = require('../stock_system/stock_chart');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('선물')
        .setDescription('주식 선물이란 미래의 특정 시점에 주식을 미리 결정된 가격으로 매수하거나 매도할 것을 약속하는 거래입니다')
        .addSubcommand((subCommand) =>
            subCommand.setName('목록')
                .setDescription('선물 종목과 가격을 가져옵니다.')
                .addStringOption((option) =>
                    option.setName('정렬기준')
                        .setDescription('주식 종목을 정렬할 기준을 설정합니다.')
                        .setChoices(
                            { name: '가격순(높은)', value: '가격순(높은)' },
                            { name: '가격순(낮은)', value: '가격순(낮은)' },
                            { name: '상승순', value: '상승순' },
                            { name: '하락순', value: '하락순' },
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('정보')
                .setDescription('해당 선물의 정보를 가져옵니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('정보를 표시할 종목 코드 또는 종목명')
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('차트')
                .setDescription('선물 차트를 표시합니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('차트에 표시할 종목 코드 또는 종목명의 목록. ex) AAPL, TSLA, GME ...')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('일')
                        .setDescription('불러올 차트 시간대의 범위 (일)')
                        .setMaxValue(30)
                        .setRequired(false)
                )
                .addIntegerOption((option) =>
                    option.setName('시간')
                        .setDescription('불러올 차트 시간대의 범위 (시간)')
                        .setMaxValue(23)
                        .setRequired(false)
                )
                .addIntegerOption((option) =>
                    option.setName('분')
                        .setDescription('불러올 차트 시간대의 범위 (분)')
                        .setMaxValue(59)
                        .setRequired(false)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('매수')
                .setDescription('선물을 매수합니다. 만기일은 /선물 만기일 을 통해 확인할 수 있습니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('선물을 매수할 종목 코드 또는 종목명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수량')
                        .setDescription('매수할 선물의 계약수')
                        .setMinValue(1)
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('레버리지')
                        .setDescription('레버리지 배율')
                        .setChoices(
                            { name: '2배', value: 2 },
                            { name: '3배', value: 3 },
                            { name: '5배', value: 5 },
                            { name: '10배', value: 10 },
                        )
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('매도')
                .setDescription('선물을 매도합니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('선물을 매도할 종목 코드 또는 종목명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수량')
                        .setDescription('매도할 선물의 계약수')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('만기일')
                .setDescription('선물의 만기일을 가져옵니다.')
        ),
    
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand;

        if (subCommand === '목록') {

        }
        else if (subCommand === '정보') {

        }
        else if (subCommand === '차트') {

        }
        else if (subCommand === '매수') {

        }
        else if (subCommand === '매도') {

        }
        else if (subCommand === '만기일') {

        }
    }
}