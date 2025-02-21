const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { tryGetTicker, getOptionPrice, getOptionStrikePriceList, getOptionTimeRangeData, getOptionStrikePriceIndex, getOptionExpirationDate } = require('../stock_system/stock_sim');
const { callOptionBuy, callOptionSell, putOptionBuy, putOptionSell, optionLiquidate } = require('../database');
const { generateStockChartImage } = require('../stock_system/stock_chart');
const { serverLog } = require('../server/server_logger');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('옵션')
        .setDescription('옵션이란 미리 정한 가격으로 미래에 주식을 사거나 팔 수 있는 권리입니다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('가격')
                .setDescription('옵션의 가격을 가져옵니다.')
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('정보를 표시할 종목 코드 또는 종목명')
                        .setRequired(true)
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
                .addStringOption((option) =>
                    option.setName('종류')
                        .setDescription('옵션의 종류 (콜 or 풋)')
                        .setChoices(
                            { name: '콜(Call)', value: 'call'},
                            { name: '풋(Put)', value: 'put'},
                        )
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('행사가격')
                        .setDescription('차트에 표시할 옵션의 행사 가격')
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
                        .setDescription('만기일은 **/옵션 만기일**, 행사가격은 **/행사가격**을 통해 확인할 수 있습니다.')
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
                        .addIntegerOption((option) =>
                            option.setName('행사가격')
                                .setDescription('옵션을 행사할 때 적용되는 가격')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('매도')
                        .setDescription('행사가격은 **/행사가격**을 통해 확인할 수 있습니다.')
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
                        .addIntegerOption((option) =>
                            option.setName('행사가격')
                                .setDescription('옵션을 행사할 때 적용되는 가격')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                )
       
        )
        .addSubcommandGroup((subCommandGroup) =>
            subCommandGroup.setName('풋')
                .setDescription('풋옵션이란 미리 정한 가격으로 미래에 주식을 팔 수 있는 권리입니다.')
                .addSubcommand((subCommand) =>
                    subCommand.setName('매수')
                        .setDescription('만기일은 **/옵션 만기일**, 행사가격은 **/행사가격**을 통해 확인할 수 있습니다.')
                        .addStringOption((option) =>
                            option.setName('종목')
                                .setDescription('풋옵션을 매수하려는 종목 코드 또는 종목명')
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('수량')
                                .setDescription('매수할 풋옵션의 수량')
                                .setMinValue(0)
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('행사가격')
                                .setDescription('옵션을 행사할 때 적용되는 가격')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('매도')
                        .setDescription('행사가격은 **/행사가격**을 통해 확인할 수 있습니다.')
                        .addStringOption((option) =>
                            option.setName('종목')
                                .setDescription('풋옵션을 매도하려는 종목 코드 또는 종목명')
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('수량')
                                .setDescription('매도할 풋옵션의 수량')
                                .setMinValue(0)
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('행사가격')
                                .setDescription('옵션을 행사할 때 적용되는 가격')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('청산')
                .setDescription('옵션 포지션을 청산합니다.')
                .addIntegerOption((option) =>
                    option.setName('포지션번호')
                        .setDescription('청산할 옵션 포지션의 번호 (1부터 시작 / **/자산** 을 통해 확인)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('만기일')
                .setDescription('옵션의 만기일을 가져옵니다.')
        ),
    
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === '가격') {
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

            const optionPrices = getOptionPrice(ticker);

            if (optionPrices === null) {
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
            } else {
                const strikePriceList = getOptionStrikePriceList(ticker);
                const call = optionPrices.call;
                const put = optionPrices.put;

                const fields = [];

                let callFormat = '';
                for (let i = 0; i < call.length; i++) {
                    callFormat += `\n${strikePriceList[i]}원: ${call[i]}`;
                }

                fields.push({
                    name: ':chart_with_upwards_trend:  풋옵션',
                    value: `\`\`\`${callFormat}\`\`\``,
                });
                
                let putFormat = '';
                for (let i = 0; i < put.length; i++) {
                    putFormat += `\n${strikePriceList[i]}원: ${put[i]}`;
                }

                fields.push({
                    name: ':chart_with_downwards_trend:  콜옵션',
                    value: `\`\`\`${putFormat}\`\`\``,
                });

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle(`${ticker} 옵션 가격`)
                            .setFields(fields)
                    ],
                });
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

            const direction = interaction.options.getString('종류');
            const strikePrice = interaction.options.getInteger('행사가격');

            if (getOptionStrikePriceIndex(ticker, strikePrice) === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  차트 불러오기 실패')
                            .setDescription(`존재하지 않는 행사가격입니다.`)
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
            
            const result = await generateStockChartImage(ticker, getOptionTimeRangeData([ticker], (days * 24) + hours, minutes, direction, strikePrice), minutes);

            try {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(':chart_with_upwards_trend:  옵션 차트')
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
        } else if (subCommand === '청산') {
            const positionNum = interaction.options.getInteger('포지션번호');

            const result = await optionLiquidate(interaction.user.id, positionNum);

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
                let formattedOptionType;
                if (result.optionType === 'call') {
                    formattedOptionType = '콜';
                } else if (result.optionType === 'put') {
                    formattedOptionType = '풋';
                }

                let positionType;
                if (result.quantity > 0) {
                    positionType = '매수';
                } else if (result.quantity < 0) {
                    positionType = '매도';
                }
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  포지션 청산 완료')
                            .setDescription(`${result.ticker} 옵션 ${formattedOptionType} ${positionType} 포지션 ${Math.abs(result.quantity)}계약이 청산되었습니다.`)
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '만기일') {
            const expirationDate = getOptionExpirationDate();
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('옵션 만기일')
                        .setDescription(`${moment(expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm')}`)
                ],
            });
        } else {
            const subCommandGroup = interaction.options.getSubcommandGroup();

            if (subCommandGroup === '콜') {
                if (subCommand === '매수') {
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
                    const strikePrice = interaction.options.getInteger('행사가격');

                    const result = await callOptionBuy(interaction.user.id, ticker, quantity, strikePrice);

                    if (result === 'invalid_strikePrice') {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle(':x: 주문 실패')
                                    .setDescription('현재 거래되고 있지 않는 상품입니다.')
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
                                    .setDescription(`콜옵션 ${quantity}계약 매수 주문이 체결되었습니다.`)
                                    .setTimestamp()
                            ],
                        });
                    } else {
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
                    const strikePrice = interaction.options.getInteger('행사가격');

                    const result = await callOptionSell(interaction.user.id, ticker, quantity, strikePrice);

                    if (result === 'invalid_strikePrice') {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle(':x: 주문 실패')
                                    .setDescription('현재 거래되고 있지 않는 상품입니다.')
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
                                    .setDescription(`콜옵션 ${quantity}계약 매도 주문이 체결되었습니다.`)
                                    .setTimestamp()
                            ],
                        });
                    } else {
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
                }
            } else if (subCommandGroup === '풋') {
                if (subCommand === '매수') {
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
                    const strikePrice = interaction.options.getInteger('행사가격');

                    const result = await putOptionBuy(interaction.user.id, ticker, quantity, strikePrice);

                    if (result === 'invalid_strikePrice') {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle(':x: 주문 실패')
                                    .setDescription('현재 거래되고 있지 않는 상품입니다.')
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
                                    .setDescription(`풋옵션 ${quantity}계약 매수 주문이 체결되었습니다.`)
                                    .setTimestamp()
                            ],
                        });
                    } else {
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
                    const strikePrice = interaction.options.getInteger('행사가격');

                    const result = await putOptionSell(interaction.user.id, ticker, quantity, strikePrice);

                    if (result === 'invalid_strikePrice') {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle(':x: 주문 실패')
                                    .setDescription('현재 거래되고 있지 않는 상품입니다.')
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
                                    .setDescription(`풋옵션 ${quantity}계약 매도 주문이 체결되었습니다.`)
                                    .setTimestamp()
                            ],
                        });
                    } else {
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
                }
            }
        }
    }
}