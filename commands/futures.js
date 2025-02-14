const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { tryGetTicker, getFutureList, getFutureExpirationDate } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');
const { checkUserExists, futureBuy, futureLiquidate } = require('../database');
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
                        .setDescription('종목을 정렬할 기준을 설정합니다.')
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
                        .setMinValue(0)
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
                        .setMinValue(0)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('청산')
                .setDescription('선물 포지션을 청산합니다.')
                .addIntegerOption((option) =>
                    option.setName('포지션번호')
                        .setDescription('청산할 선물 포지션의 번호 (1부터 시작 / **/자산** 을 통해 확인)')
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
            let sortingOption = interaction.options.getString('정렬기준');

            if (sortingOption === null) {
                sortingOption = '가격순(높은)';
            }

            const future_list = getFutureList();
            let stock_list_format = [];

            const ticker_list = [];
            const price_list = [];
            const difference_list = [];

            let sorted_future_list;
            if (sortingOption === '가격순(높은)') {
                sorted_future_list = [...future_list].sort((a, b) => b.price - a.price);
            } else if (sortingOption === '가격순(낮은)') {
                sorted_future_list = [...future_list].sort((a, b) => a.price - b.price);
            } else if (sortingOption === '상승순') {
                sorted_future_list = [...future_list].sort((a, b) => b.difference - a.difference);
            } else if (sortingOption === '하락순') {
                sorted_future_list = [...future_list].sort((a, b) => a.difference - b.difference);
            }
        } else if (subCommand === '차트') {
            let ticker = interaction.options.getString('종목');
            ticker = tryGetTicker(ticker.trim());
            
            if (ticker === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  차트 불러오기 실패')
                            .setDescription(`존재하지 않는 종목입니다.`)
                            .setTimestamp()
                    ],
                });
                return;
            }
        } else if (subCommand === '매수') {
            let ticker = interaction.options.getString('종목');
            ticker = tryGetTicker(ticker.trim());
            
            if (ticker === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`존재하지 않는 종목입니다.`)
                            .setTimestamp()
                    ],
                });
                return;
            }

            const quantity = interaction.options.getInteger('수량');
            const leverage = interaction.options.getInteger('레버리지');

            const result = await futureBuy(interaction.user.id, ticker, quantity, leverage);

            console.log(`result: ${result}`);

            if (result === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`오류가 발생하였습니다.
                                공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                            .setTimestamp()
                    ],
                });
                return;
            } else if (result === false) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`잔액이 부족합니다.`)
                            .setTimestamp()
                    ],
                });
            } else if (result === true) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  주문 체결 완료')
                            .setDescription(`${ticker} 선물 ${quantity}계약 매수 주문이 체결되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '매도') {
            let ticker = interaction.options.getString('종목');
            ticker = tryGetTicker(ticker.trim());
            
            if (ticker === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`존재하지 않는 종목입니다.`)
                            .setTimestamp()
                    ],
                });
                return;
            }
        } else if (subCommand === '청산') {
            const positionNum = interaction.options.getInteger('포지션번호');

            const result = await futureLiquidate(interaction.user.id, positionNum);

            if (result === true) {

            } else if (result === 'invalid_position') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  상환 실패')
                            .setDescription(`존재하지 않는 포지션입니다.`)
                            .setTimestamp()
                    ],
                });
            } else if (result === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`오류가 발생하였습니다.
                                공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                            .setTimestamp()
                    ],
                });
            }
        }
        else if (subCommand === '만기일') {
            const expirationDate = getFutureExpirationDate();
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('선물 만기일')
                        .setDescription(`${moment(expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm')}`)
                ],
            });
        }
    }
}