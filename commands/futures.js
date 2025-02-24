const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { tryGetTicker, getFutureList, getFutureExpirationDate, getFutureTimeRangeData } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');
const { checkUserExists, futureLiquidate, futureLong, futureShort } = require('../database');
const { generateStockChartImage } = require('../stock_system/stock_chart');
const { serverLog } = require('../server/server_logger');
const fs = require('fs');
const moment = require('moment-timezone');

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
            subCommand.setName('롱')
                .setDescription('선물 롱 포지션을 취합니다. 만기일은 /선물 만기일 을 통해 확인할 수 있습니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('선물의 종목 코드 또는 종목명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수량')
                        .setDescription('선물의 계약수')
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
                            { name: '20배', value: 20 },
                            { name: '50배', value: 50 },
                            { name: '100배', value: 100 },
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('숏')
                .setDescription('선물 숏 포지션을 잡습니다. 만기일은 /선물 만기일 을 통해 확인할 수 있습니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('선물의 종목 코드 또는 종목명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수량')
                        .setDescription('선물의 계약수')
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
                            { name: '20배', value: 20 },
                            { name: '50배', value: 50 },
                            { name: '100배', value: 100 },
                        )
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
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === '목록') {
            let sortingOption = interaction.options.getString('정렬기준');

            if (sortingOption === null) {
                sortingOption = '가격순(높은)';
            }

            const future_list = getFutureList();
            let future_list_format = [];

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

            for (const future of sorted_future_list) {
                let color;
                let difference_sign;

                if (future.difference > 0) {
                    color = '+';
                    difference_sign = '+';
                } else if (future.difference < 0) {
                    color = '-';
                    difference_sign = '-';
                } else {
                    color = '=';
                    difference_sign = '';
                }
                future_list_format.push(`${getStockName(future.ticker)} [${future.ticker}]\n\`\`\`diff\n${color} ${future.price.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")} (${difference_sign}${Math.abs(future.difference).toFixed(2)})\n\`\`\``);
            }

            const pages = [];
            const ITEMS_PER_PAGE = 5;
            for (let i = 0; i < future_list_format.length; i += ITEMS_PER_PAGE) {
                pages.push(future_list_format.slice(i, i + ITEMS_PER_PAGE));
            }

            const uid = uuidv4().replace(/-/g, '');
            const cacheData = { pages: pages, currentPage: 0 };
            createCache(uid, 15);
            saveCache(uid, cacheData);

            const previousPage = new ButtonBuilder()
                .setCustomId(`future_previous_page-${interaction.user.id}-${uid}`)
                .setLabel('이전')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            
            const nextPage = new ButtonBuilder()
                .setCustomId(`future_next_page-${interaction.user.id}-${uid}`)
                .setLabel('다음')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false);

            const row = new ActionRowBuilder()
                .addComponents(previousPage, nextPage);
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(':chart_with_upwards_trend:  선물 목록')
                    .setDescription(`${pages[0].join('\n')}`)
                    .setTimestamp()
                ],
                components: [row],
                fetchReply: true
            });
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

            let days = interaction.options.getInteger('일');
            let hours = interaction.options.getInteger('시간');
            let minutes = interaction.options.getInteger('분');

            if ((days === null) && (hours === null) && (minutes === null)) {
                days = 0;
                hours = 6;
                minutes = 0;
            } else {
                if (days === null) days = 0;
                if (hours === null) hours = 0;
                if (minutes === null) minutes = 0;
            }

            const result = await generateStockChartImage(ticker, getFutureTimeRangeData([ticker], (days * 24) + hours, minutes), minutes);

            try {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(':chart_with_upwards_trend:  선물 차트')
                            .setImage(`attachment://${result.filename}`)
                    ],
                    files: [{
                        attachment: await result.filepath,
                        name: result.filename,
                     }],
                });

                try {
                    fs.unlink(result.filepath,  (err) => {
                        if (err) {
                            serverLog(`[ERROR] Error deleting chart image file: ${err}`);
                        }
                    });
                } catch (err) {
                    serverLog(`[ERROR] Error deleting chart image file: ${err}`);
                }
            } catch (err) {
                serverLog(`[ERROR] Error uploading chart image: ${err}`);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                            .setTimestamp()
                    ],
                });
                return;
            }
        } else if (subCommand === '롱') {
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

            const result = await futureLong(interaction.user.id, ticker, quantity, leverage);

            console.log(`result: ${result}`);

            if (result === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
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
                            .setDescription(`${ticker} 선물 롱 ${quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약 매수 주문이 체결되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '숏') {
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

            const result = await futureShort(interaction.user.id, ticker, quantity, leverage);

            if (result === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
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
                            .setDescription(`${ticker} 선물 숏 ${quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약 매도 주문이 체결되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '청산') {
            const positionNum = interaction.options.getInteger('포지션번호');

            const result = await futureLiquidate(interaction.user.id, positionNum);

            if (result === 'invalid_position') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  청산 실패')
                            .setDescription(`존재하지 않는 포지션입니다.`)
                            .setTimestamp()
                    ],
                });
            } else if (result === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  청산 실패')
                            .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                            .setTimestamp()
                    ],
                });
            } else {
                let positionType;
                if (result.quantity > 0) {
                    positionType = '롱';
                } else if (result.quantity < 0) {
                    positionType = '숏';
                }
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  포지션 청산 완료')
                            .setDescription(`${result.ticker} 선물 ${positionType} 포지션 ${Math.abs(result.quantity).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약이 청산되었습니다.`)
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