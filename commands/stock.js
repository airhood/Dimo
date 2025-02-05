const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { getStockList, tryGetTicker, getTickerList, getTimeRangeData, getStockInfo } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');
const { stockBuy, stockSell, checkUserExists, stockShortSell, stockShortRepay } = require('../database');
const { generateStockChartImage } = require('../stock_system/stock_chart');
const { serverLog } = require('../server/server_logger');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('주식')
        .setDescription('주식이란 기업의 소유권을 나타내는 증권입니다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('목록')
                .setDescription('주식 종목과 가격을 가져옵니다.')
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
                .setDescription('해당 주식의 정보를 가져옵니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('정보를 표시할 종목 코드 또는 종목명')
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('차트')
                .setDescription('주식 차트를 표시합니다.')
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
                .setDescription('주식을 매수합니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('매수할 주식의 종목 코드')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수량')
                        .setDescription('매수할 주식의 수량')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('매도')
                .setDescription('주식을 매도합니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('매도할 주식의 종목 코드 또는 종목명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수량')
                        .setDescription('매도할 주식의 수량')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('공매도')
                .setDescription('주식을 차입하여 매도합니다. 주식 차입 과정에서 이자가 발생합니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('공매도할 주식의 종목 코드 또는 종목명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수량')
                        .setDescription('공매도할 주식의 수량')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('상환')
                .setDescription('공매도 시에 차입한 주식을 상환합니다. 한 포지션은 한 번에 상환해야 합니다.')
                .addIntegerOption((option) =>
                    option.setName('포지션번호')
                        .setDescription('상환할 공매도 포지션의 번호 (1부터 시작 / **/자산** 을 통해 확인)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        ),
    
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        
        if (subCommand === '목록') {
            let sortingOption = interaction.options.getString('정렬기준');

            if (sortingOption === null) {
                sortingOption = '가격순(높은)';
            }

            const stock_list = getStockList();
            let stock_list_format = [];

            const ticker_list = [];
            const price_list = [];
            const difference_list = [];

            let sorted_stock_list;
            if (sortingOption === '가격순(높은)') {
                sorted_stock_list = [...stock_list].sort((a, b) => b.price - a.price);
            } else if (sortingOption === '가격순(낮은)') {
                sorted_stock_list = [...stock_list].sort((a, b) => a.price - b.price);
            } else if (sortingOption === '상승순') {
                sorted_stock_list = [...stock_list].sort((a, b) => b.difference - a.difference);
            } else if (sortingOption === '하락순') {
                sorted_stock_list = [...stock_list].sort((a, b) => a.difference - b.difference);
            }

            for (stock of sorted_stock_list) {
                let color;
                let difference_sign;
                if (stock.difference > 0) {
                    color = '+';
                    difference_sign = '+';
                } else if (stock.difference < 0) {
                    color = '-';
                    difference_sign = '-';
                } else {
                    color = '=';
                    difference_sign = '';
                }
                stock_list_format.push(`${getStockName(stock.ticker)} [${stock.ticker}]\n\`\`\`diff\n${color} ${stock.price} (${difference_sign}${Math.abs(stock.difference)})\n\`\`\``);
                
                /*
                if (stock.difference > 0) {
                    difference_sign = '+';
                }
                else if (stock.difference < 0) {
                    difference_sign = '-';
                }
                else {
                    difference_sign = '';
                }

                ticker_list.push(`${getStockName(stock.ticker)} [${stock.ticker}]`);
                price_list.push(stock.price);
                difference_list.push(`${difference_sign}${Math.abs(stock.difference)}`);
                */
            }

            const pages = [];
            const ITEMS_PER_PAGE = 5;
            for (let i = 0; i < stock_list_format.length; i += ITEMS_PER_PAGE) {
                pages.push(stock_list_format.slice(i, i + ITEMS_PER_PAGE));
            }

            const uid = uuidv4().replace(/-/g, '');
            const cacheData = { pages: pages, currentPage: 0 };
            createCache(uid, 15);
            saveCache(uid, cacheData);

            const previousPage = new ButtonBuilder()
                .setCustomId(`stock_previous_page-${interaction.user.id}-${uid}`)
                .setLabel('이전')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            
            const nextPage = new ButtonBuilder()
                .setCustomId(`stock_next_page-${interaction.user.id}-${uid}`)
                .setLabel('다음')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false);

            const row = new ActionRowBuilder()
                .addComponents(previousPage, nextPage);
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(':chart_with_upwards_trend:  주식 목록')
                    .setDescription(`${pages[0].join('\n')}`)
                    .setTimestamp()
                ],
                components: [row],
                fetchReply: true
            });

            // await interaction.reply({
            //     embeds: [
            //         new EmbedBuilder()
            //         .setColor(0xF1C40F)
            //             .setTitle(':chart_with_upwards_trend:  주식 목록')
            //             .addFields(
            //                 { name: '종목', value: ticker_list.join('\n\n'), inline: true },
            //                 { name: '가격', value: price_list.join('\n\n'), inline: true },
            //                 { name: '변동량', value: difference_list.join('\n\n'), inline: true },
            //             )
            //             .setTimestamp()
            //     ],
            // });

            /*
            const data = [
                ['종목', '가격', '변동량'],
                ...ticker_list.map((ticker, index) => [
                    ticker,
                    price_list[index],
                    difference_list[index],
                ])
            ];

            const config = {
                columnDefault: {
                    alignment: 'right',
                    paddingLeft: 1,
                    paddingRight: 1,
                },
                columns: {
                    0: { alignment: 'left' },
                    1: { alignment: 'right' },
                    2: { alignment: 'right' },
                },
            };

            const output = table(data, config);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(':chart_with_upwards_trend:  주식 목록')
                    .setDescription(`\`\`\`${output}\`\`\``)
                    .setTimestamp()
                ],
            });
            */
        } else if (subCommand === '정보') {
            const ticker_input = interaction.options.getString('종목');
            const ticker = tryGetTicker(ticker_input.trim());
            if (ticker === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('정보 없음')
                            .setDescription(`존재하지 않는 종목입니다.`)
                    ],
                });
                return;
            }

            const stockInfo = await getStockInfo(ticker);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('주식 정보')
                        .setDescription(`**종목명:** ${stockInfo.name}
                            **티커:** ${stockInfo.ticker}
                            **현재가격:** ${stockInfo.price}원
                            **발행량:** ${stockInfo.totalQuantity}주`)
                ],
            });
        } else if (subCommand === "차트") {
            /*
            const ticker_input = interaction.options.getString('종목');
            let ticker_list;
            if (ticker_input === null) {
                ticker_list = getTickerList();
            }
            else {
                ticker_list = ticker_input.split(',');
                const new_ticker_list = [];
                for (let ticker of ticker_list) {
                    new_ticker_list.push(tryGetTicker(ticker.trim()));
                    if (ticker === null) {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle('정보 없음')
                                    .setDescription(`존재하지 않는 종목이 포함되어 있습니다.`)
                            ],
                        });
                        return;
                    }
                }

                ticker_list = new_ticker_list;
            }
            */

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

            const result = await generateStockChartImage(ticker, getTimeRangeData([ticker], (days * 24) + hours, minutes), minutes)
            
            try {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(':chart_with_upwards_trend:  주가 차트')
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
                            .setDescription(`오류가 발생하였습니다.
                                공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
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

            const result = await stockBuy(interaction.user.id, ticker, quantity);

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
                            .setDescription(`${ticker} ${quantity}주 매수 주문이 체결되었습니다.`)
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
            }

            const quantity = interaction.options.getInteger('수량');

            const result = await stockSell(interaction.user.id, ticker, quantity);

            if (result === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`전산 오류가 발생하였습니다.`)
                            .setTimestamp()
                    ],
                });
            } else if (result === false) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`<@${interaction.user.id}> 보유 주식이 부족합니다.`)
                            .setTimestamp()
                    ],
                });
            } else if (result === true) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  주문 체결 완료')
                            .setDescription(`${ticker} ${quantity}주 매도 주문이 체결되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '공매도') {
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
            }

            const quantity = interaction.options.getInteger('수량');

            const result = await stockShortSell(interaction.user.id, ticker, quantity);

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
            } else if (result === false) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  주문 실패')
                            .setDescription(`잔액이 부족합니다.\n공매도는 거래금액의 140%에 해당하는 증거금이 필요합니다.`)
                            .setTimestamp()
                    ],
                });
            } else if (result === true) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  주문 체결 완료')
                            .setDescription(`${ticker} ${quantity}주 공매도 주문이 체결되었습니다.\n상환일은 5일 후 입니다.`)
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '상환') {
            const positionNum = interaction.options.getInteger('포지션번호');

            const result = await stockShortRepay(interaction.user.id, positionNum);

            if (result === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  상환 실패')
                            .setDescription(`오류가 발생하였습니다.
                                공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                            .setTimestamp()
                    ],
                });
            } else if (result === false) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  상환 실패')
                            .setDescription(`주식이 부족합니다.\n한 포지션은 한 번에 상환해야 합니다.`)
                            .setTimestamp()
                    ],
                });
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
            } else {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  상환 완료')
                            .setDescription(`${result.ticker} ${result.quantity}주 상환되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }
        }
    },
}