const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { tryGetTicker, getTickerList, getTimeRangeData } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');
const { checkUserExists } = require('../database');
const { generateStockChartImage } = require('../stock_system/stock_chart');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('옵션')
        .setDescription('옵션이란 미리 정한 가격으로 미래에 주식을 사거나 팔 수 있는 권리입니다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('목록')
                .setDescription('옵션 종목과 가격을 가져옵니다.')
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
                .setDescription('해당 옵션의 정보를 가져옵니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('정보를 표시할 종목 코드 또는 종목명')
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('차트')
                .setDescription('옵션 차트를 표시합니다.')
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
        .addSubcommandGroup((subCommandGroup) =>
            subCommandGroup.setName('콜')
                .setDescription('콜옵션이란 미리 정한 가격으로 미래에 주식을 살 수 있는 권리입니다.')
                .addSubcommand((subCommand) =>
                    subCommand.setName('매수')
                        .setDescription('콜옵션을 매수합니다. 만기일은 /옵션 만기일 을 통해 확인할 수 있습니다.')
                        .addStringOption((option) =>
                            option.setName('종목')
                                .setDescription('콜옵션을 매수하려는 종목 코드 또는 종목명')
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('수량')
                                .setDescription('매수할 콜옵션의 수량')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                        .addStringOption((option) =>
                            option.setName('행사가격')
                                .setDescription('옵션을 행사할 때 적용되는 가격')
                                .addChoices(
                                    { name: '(기초자산) x 1.05', value: '5'},
                                    { name: '(기초자산) x 1.00', value: '0'},
                                    { name: '(기초자산) x 0.95', value: '-5'},
                                )
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('매도')
                        .setDescription('콜옵션을 매도합니다.')
                        .addStringOption((option) =>
                            option.setName('종목')
                                .setDescription('콜옵션을 매도하려는 종목 코드 또는 종목명')
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('수량')
                                .setDescription('매도할 콜옵션의 수량')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                        .addStringOption((option) =>
                            option.setName('행사가격')
                                .setDescription('옵션을 행사할 때 적용되는 가격')
                                .addChoices(
                                    { name: '(기초자산) x 1.05', value: '1.05'},
                                    { name: '(기초자산) x 1.00', value: '1.00'},
                                    { name: '(기초자산) x 0.95', value: '0.95'},
                                )
                                .setRequired(true)
                        )
                )
       
        )
        .addSubcommandGroup((subCommandGroup) =>
            subCommandGroup.setName('풋')
                .setDescription('풋옵션이란 미리 정한 가격으로 미래에 주식을 팔 수 있는 권리입니다.')
                .addSubcommand((subCommand) =>
                    subCommand.setName('매수')
                        .setDescription('풋옵션을 매수합니다.')
                        .addStringOption((option) =>
                            option.setName('종목')
                                .setDescription('풋옵션을 매수하려는 종목 코드 또는 종목명')
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('수량')
                                .setDescription('매수할 풋옵션의 수량')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('매도')
                        .setDescription('풋옵션을 매도합니다.')
                        .addStringOption((option) =>
                            option.setName('종목')
                                .setDescription('풋옵션을 매도하려는 종목 코드 또는 종목명')
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('수량')
                                .setDescription('매도할 풋옵션의 수량')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('만기일')
                .setDescription('옵션의 만기일을 가져옵니다.')
        ),
    
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand;

        if (subCommand === '목록') {

        }
        else if (subCommand === '정보') {

        }
        else if (subCommand === '차트') {

        }
        else if (subCommand === '만기일') {
            
        }
        else {
            const subCommandGroup = interaction.options.getSubcommandGroup();

            if (subCommandGroup === '콜') {
                if (subCommand === '매수') {

                }
                else if (subCommand === '매도') {
                    
                }
            }
            else if (subCommandGroup === '풋') {
                if (subCommand === '매수') {

                }
                else if (subCommand === '매도') {
                    
                }
            }
        }
    }
}