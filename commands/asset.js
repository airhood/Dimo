const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, getUserAsset, getFundAsset } = require('../database');
const moment = require('moment-timezone');
const { getStockPrice, getFuturePrice, getCallOptionPrice, getPutOptionPrice, getOptionPrice, getOptionStrikePriceIndex } = require('../stock_system/stock_sim');
const asset = require('../schemas/asset');
const { getFundPrice } = require('../stock_system/fund_price');
const { OPTION_UNIT_QUANTITY } = require('../setting');


const ROUND_POS = 3;

function mergePositions(existingQuantity, existingPurchasePrice, newQuantity, newPurchasePrice) {
    const totalQuantity = existingQuantity + newQuantity;
    
    const newAveragePrice = (existingPurchasePrice * existingQuantity + newPurchasePrice * newQuantity) / totalQuantity;

    return { totalQuantity, newAveragePrice };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('자산')
        .setDescription('자산을 표시합니다.')
        .addSubcommand((sub) =>
            sub.setName('개인')
                .setDescription('유저의 개인 계좌 자산을 표시합니다.')
                .addUserOption((opt) =>
                    opt.setName('유저')
                        .setDescription('자산을 확인할 유저')
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt.setName('상세정보')
                        .setDescription('자산의 상세정보 표시 여부')
                        .addChoices(
                            { name: '표시', value: '표시' },
                            { name: '숨기기', value: '숨기기' },
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('펀드')
                .setDescription('펀드 계좌의 자산을 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('이름')
                        .setDescription('조회할 펀드 이름')
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt.setName('상세정보')
                        .setDescription('자산의 상세정보 표시 여부')
                        .addChoices(
                            { name: '표시', value: '표시' },
                            { name: '숨기기', value: '숨기기' },
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        let loadDetails = interaction.options.getString('상세정보');

        if (loadDetails === '표시') loadDetails = true;
        else loadDetails = false;

        let result;
        let embedTitle;

        if (subCommand === '개인') {
            let targetUser = interaction.options.getUser('유저') ?? interaction.user;

            const userExists = await checkUserExists(targetUser.id);
            if (userExists.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
                return;
            }
            if (userExists.data === false) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('존재하지 않는 계정입니다').setDescription(`<@${targetUser.id}>의 계정이 존재하지 않습니다.`)],
                });
                return;
            }

            result = await getUserAsset(targetUser.id);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
                return;
            }
            embedTitle = `:bank:  자산 [${targetUser.username}]`;

        } else if (subCommand === '펀드') {
            const fundName = interaction.options.getString('이름');

            result = await getFundAsset(fundName);
            if (result.state === 'no_fund') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('펀드 없음').setDescription(`**${fundName}** 펀드가 존재하지 않습니다.`)],
                });
                return;
            }
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
                return;
            }
            embedTitle = `:bank:  자산 [${fundName} 펀드]`;
        }

        /*
        if (!loadDetails) {
            const stocksMap = new Map();
            result.data.asset.stocks.forEach(stock => {
                if (stocksMap.has(stock.ticker)) {
                    const existingStock = stocksMap.get(stock.ticker);
                    const { totalQuantity, newAveragePrice } = mergePositions(existingStock.quantity, existingStock.purchasePrice, stock.quantity, stock.purchasePrice);
                    existingStock.quantity = totalQuantity;
                    existingStock.purchasePrice = newAveragePrice;
                } else {
                    stocksMap.set(stock.ticker, JSON.parse(JSON.stringify(stock)));
                }
            });
            const mergedStocks = [...stocksMap.values()];
            
            const futuresMap = new Map();
            result.data.asset.futures.forEach(future => {
                let direction;
                if (future.quantity > 0) {
                    direction = 'call';
                } else if (future.quantity < 0) {
                    direction = 'put';
                }
                const key = `${future.ticker}-${future.leverage}-${direction}`;
                if (futuresMap.has(key)) {
                    const existingFuture = futuresMap.get(key);
                    const { totalQuantity, newAveragePrice } = mergePositions(existingFuture.quantity, existingFuture.purchasePrice, future.quantity, future.purchasePrice);
                    existingFuture.quantity = totalQuantity;
                    existingFuture.purchasePrice = newAveragePrice;
                } else {
                    futuresMap.set(key, JSON.parse(JSON.stringify(future)));
                }
            });
            const mergedFutures = [...futuresMap.values()];
            
            const optionsMap = new Map();
            result.data.asset.options.forEach(option => {
                const key = `${option.ticker}-${option.optionType}-${option.strikePrice}`;
                if (optionsMap.has(key)) {
                    const existingOption = optionsMap.get(key);
                    const { totalQuantity, newAveragePrice } = mergePositions(existingOption.quantity, existingOption.purchasePrice, option.quantity, option.purchasePrice);
                    existingOption.quantity = totalQuantity;
                    existingOption.purchasePrice = newAveragePrice;
                } else {
                    optionsMap.set(key, JSON.parse(JSON.stringify(option)));
                }
            });
            const mergedOptions = [...optionsMap.values()];

            const binary_options = [...result.data.asset.binary_options];
            const mergedFixedDeposits = [...result.data.asset.fixed_deposits];
            const mergedSavingsAccounts = [...result.data.asset.savings_accounts];
            const mergedLoans = [...result.data.asset.loans];
            
            const mergedAsset = {
                user: result.data.asset.user,
                balance: result.data.asset.balance,
                stocks: mergedStocks,
                stockShortSales: result.data.asset.stockShortSales,
                futures: mergedFutures,
                options: mergedOptions,
                binary_options: binary_options,
                fixed_deposits: mergedFixedDeposits,
                savings_accounts: mergedSavingsAccounts,
                loans: mergedLoans,
            };

            result.data.asset = mergedAsset;
        }
        */

        const fields = [
            {
                name: ':dollar:  계좌 잔액',
                value: `\`\`\`${result.data.asset.balance.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원\`\`\``,
            }
        ];

        
        let totalEarn = 0;


        let stock_format = '';

        if (loadDetails) {
            for (const stock of result.data.asset.stocks) {
                if (stock_format !== '') stock_format += '\n';
                const formattedPurchaseDate = moment(stock.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

                const earn = (getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice;
                let earnSign;
                if (earn > 0) {
                    earnSign = '+';
                } else if (earn === 0) {
                    earnSign = '';
                } else if (earn < 0) {
                    earnSign = '';
                }

                totalEarn += stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice);

                stock_format += `${stock.ticker} ${stock.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주
| 현재가격: ${getStockPrice(stock.ticker).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매수가격: ${stock.purchasePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 매수날짜: ${formattedPurchaseDate}`;
            }

            if (result.data.asset.stockShortSales.length > 0) {
                stock_format += '\n\n----- 공매도 -----';
            }

            for (const short of result.data.asset.stockShortSales) {
                if (stock_format !== ' ') stock_format += '\n';
                const formattedSellDate = moment(short.sellDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedBuyBackDate = moment(short.buyBackDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

                const earn = (short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice;
                let earnSign;
                if (earn > 0) {
                    earnSign = '+';
                } else if (earn === 0) {
                    earnSign = '';
                } else if (earn < 0) {
                    earnSign = '';
                }

                totalEarn += stock.quantity * (short.sellPrice - getStockPrice(short.ticker));

                stock_format += `${short.ticker} ${-short.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주
| 현재가격: ${getStockPrice(short.ticker).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매도가격: ${short.sellPrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(stock.quantity * (short.sellPrice - getStockPrice(short.ticker))).toFixed().toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(((short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 상환일: ${formattedBuyBackDate}
| 매도날짜: ${formattedSellDate}`;
            }
        } else {
            for (const stock of result.data.asset.stocks) {
                if (stock_format !== '') stock_format += '\n';

                const earn = (getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice;
                let earnSign;
                if (earn > 0) {
                    earnSign = '+';
                } else if (earn === 0) {
                    earnSign = '';
                } else if (earn < 0) {
                    earnSign = '';
                }

                totalEarn += stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice);

                stock_format += `${stock.ticker} ${stock.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주 (평가손익: ${(stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
            }

            if (result.data.asset.stockShortSales.length > 0) {
                stock_format += '\n\n----- 공매도 -----';
            }

            for (const short of result.data.asset.stockShortSales) {
                if (stock_format !== ' ') stock_format += '\n';

                const earn = (short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice;
                let earnSign;
                if (earn > 0) {
                    earnSign = '+';
                } else if (earn === 0) {
                    earnSign = '';
                } else if (earn < 0) {
                    earnSign = '';
                }

                totalEarn += short.quantity * (short.sellPrice - getStockPrice(short.ticker));

                stock_format += `${short.ticker} ${-short.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주 (평가손익: ${(short.quantity * (short.sellPrice - getStockPrice(short.ticker))).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(((short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
            }
        }

        if (stock_format !== '') {
            fields.push({
                name: ':chart_with_upwards_trend:  주식',
                value: `\`\`\`${stock_format}\`\`\``,
            });
        }
        

        let future_format = '';

        if (loadDetails) {
            for (const future of result.data.asset.futures) {
                if (future_format !== '') future_format += '\n';
                const formattedExpirationDate = moment(future.expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedPurchaseDate = moment(future.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                
                let positionType;
                let earnRate = (getFuturePrice(future.ticker) - future.purchasePrice) / future.purchasePrice;
                let earnDirection;
                if (future.quantity > 0) {
                    positionType = '롱';
                    earnRate = (getFuturePrice(future.ticker) - future.purchasePrice) / future.purchasePrice;
                    earnDirection = 1;
                } else if (future.quantity < 0) {
                    positionType = '숏';
                    earnRate = (future.purchasePrice - getFuturePrice(future.ticker)) / future.purchasePrice;
                    earnDirection = -1;
                }

                let earnSign;
                if (earnRate > 0) {
                    earnSign = '+';
                } else if (earnRate === 0) {
                    earnSign = '';
                } else if (earnRate < 0) {
                    earnSign = '';
                }

                totalEarn += future.quantity * future.leverage * (getFuturePrice(future.ticker) - future.purchasePrice);

                future_format += `${future.ticker} ${positionType} ${Math.abs(future.quantity).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약
| 현재가격: ${getFuturePrice(future.ticker).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매수가격: ${future.purchasePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(future.quantity * future.leverage * (getFuturePrice(future.ticker) - future.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round((((getFuturePrice(future.ticker) - future.purchasePrice) * future.leverage * earnDirection) / future.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate}`;
            }
        } else {
            
            for (const future of result.data.asset.futures) {
                if (future_format !== '') future_format += '\n';
                
                let positionType;
                let earnRate = (getFuturePrice(future.ticker) - future.purchasePrice) / future.purchasePrice;
                let earnDirection;
                if (future.quantity > 0) {
                    positionType = '롱';
                    earnRate = (getFuturePrice(future.ticker) - future.purchasePrice) / future.purchasePrice;
                    earnDirection = 1;
                } else if (future.quantity < 0) {
                    positionType = '숏';
                    earnRate = (future.purchasePrice - getFuturePrice(future.ticker)) / future.purchasePrice;
                    earnDirection = -1;
                }

                let earnSign;
                if (earnRate > 0) {
                    earnSign = '+';
                } else if (earnRate === 0) {
                    earnSign = '';
                } else if (earnRate < 0) {
                    earnSign = '';
                }

                totalEarn += future.quantity * future.leverage * (getFuturePrice(future.ticker) - future.purchasePrice);

                future_format += `${future.ticker} ${positionType} ${Math.abs(future.quantity).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약 (평가손익: ${(future.quantity * future.leverage * (getFuturePrice(future.ticker) - future.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round((((getFuturePrice(future.ticker) - future.purchasePrice) * future.leverage * earnDirection) / future.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
            }
        }

        if (future_format !== '') {
            fields.push({
                name: ':receipt:  선물',
                value: `\`\`\`${future_format}\`\`\``,
            });
        }

        
        let option_format = '';
        
        if (loadDetails) {
            for (const option of result.data.asset.options) {
                if (option_format !== '') option_format += '\n\n';
                let formattedOptionType;
                const optionPrices = getOptionPrice(option.ticker);

                let currentPrice;
                if (option.optionType === 'call') {
                    formattedOptionType = '콜';
                    currentPrice = optionPrices.call[option.strikePrice.toString()];
                } else if (option.optionType === 'put') {
                    formattedOptionType = '풋';
                    currentPrice = optionPrices.put[option.strikePrice.toString()];
                }
                
                const earnRate = (currentPrice - option.purchasePrice) / option.purchasePrice;
                let earnSign;
                if (earnRate > 0) {
                    earnSign = '+';
                } else if (earnRate === 0) {
                    earnSign = '';
                } else if (earnRate < 0) {
                    earnSign = '';
                }

                const formattedExpirationDate = moment(option.expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedPurchaseDate = moment(option.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

                totalEarn += option.quantity * (currentPrice - option.purchasePrice) * OPTION_UNIT_QUANTITY;

                option_format += `${option.ticker} ${formattedOptionType}옵션 ${option.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약
| 현재가격: ${currentPrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매수가격: ${option.purchasePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(option.quantity * (currentPrice - option.purchasePrice) * OPTION_UNIT_QUANTITY).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${((Math.round(((currentPrice - option.purchasePrice) / option.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 행사가격: ${option.strikePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate}`;
            }
        } else {
            for (const option of result.data.asset.options) {
                if (option_format !== '') option_format += '\n\n';
                let formattedOptionType;
                const optionPrices = getOptionPrice(option.ticker);
                
                let currentPrice;
                if (option.optionType === 'call') {
                    formattedOptionType = '콜';
                    currentPrice = optionPrices.call[option.strikePrice.toString()];
                } else if (option.optionType === 'put') {
                    formattedOptionType = '풋';
                    currentPrice = optionPrices.put[option.strikePrice.toString()];
                }

                const earnRate = (currentPrice - option.purchasePrice) / option.purchasePrice;
                let earnSign;
                if (earnRate > 0) {
                    earnSign = '+';
                } else if (earnRate === 0) {
                    earnSign = '';
                } else if (earnRate < 0) {
                    earnSign = '';
                }

                const formattedExpirationDate = moment(option.expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedPurchaseDate = moment(option.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

                totalEarn += option.quantity * (currentPrice - option.purchasePrice) * OPTION_UNIT_QUANTITY;

                option_format += `${option.ticker} ${formattedOptionType}옵션 ${option.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약 (평가손익: ${(option.quantity * (currentPrice - option.purchasePrice) * OPTION_UNIT_QUANTITY).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${((Math.round(((currentPrice - option.purchasePrice) / option.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
            }
        }

        if (option_format !== '') {
            fields.push({
                name: ':pencil:  옵션',
                value: `\`\`\`${option_format}\`\`\``,
            });
        }


        let binary_option_format = '';
        if (loadDetails) {
            for (const binary_option of result.data.asset.binary_options) {
                if (binary_option_format !== '') binary_option_format += '\n';

                const currentPrice = getStockPrice(binary_option.ticker);

                let direction;
                if (binary_option.optionType === 'call') {
                    direction = '상승';

                    if (currentPrice > binary_option.strikePrice) {
                        totalEarn += binary_option.amount * (0.8);
                    } else if (currentPrice < binary_option.strikePrice) {
                        totalEarn -= binary_option.amount;
                    }
                } else if (binary_option.optionType === 'put') {
                    direction = '하락';

                    if (currentPrice > binary_option.strikePrice) {
                        totalEarn -= binary_option.amount;
                    } else if (currentPrice < binary_option.strikePrice) {
                        totalEarn += binary_option.amount * (0.8);
                    }
                }

                const formattedExpirationDate = moment(binary_option.expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedPurchaseDate = moment(binary_option.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

                binary_option_format += `${binary_option.ticker} ${direction} ${binary_option.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 배팅
| 현재가격: ${currentPrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 기준가격: ${binary_option.strikePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 만기일: ${formattedExpirationDate}
| 배팅날짜: ${formattedPurchaseDate}`;
            }
        } else {
            for (const binary_option of result.data.asset.binary_options) {
                if (binary_option_format !== '') binary_option_format += '\n';

                let direction;
                if (binary_option.optionType === 'call') {
                    direction = '상승';

                    if (currentPrice > binary_option.strikePrice) {
                        totalEarn += binary_option.amount * (0.8);
                    } else if (currentPrice < binary_option.strikePrice) {
                        totalEarn -= binary_option.amount;
                    }
                } else if (binary_option.optionType === 'put') {
                    direction = '하락';

                    if (currentPrice > binary_option.strikePrice) {
                        totalEarn -= binary_option.amount;
                    } else if (currentPrice < binary_option.strikePrice) {
                        totalEarn += binary_option.amount * (0.8);
                    }
                }

                binary_option_format += `${binary_option.ticker} ${direction} ${binary_option.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 배팅`;
            }
        }

        if (binary_option_format !== '') {
            fields.push({
                name: ':dart:  바이너리 옵션',
                value: `\`\`\`${binary_option_format}\`\`\``,
            });
        }


        let deposit_format = '';
        if (loadDetails) {
            for (const fixed_deposit of result.data.asset.fixed_deposits) {
                if (deposit_format !== '') deposit_format += '\n';
                const formatted_depositDate = moment(fixed_deposit.depositDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formatted_maturityDate = moment(fixed_deposit.maturityDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                deposit_format += `예금 ${fixed_deposit.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 상품: ${fixed_deposit.product}
| 이자율: ${(fixed_deposit.interestRate * 100).toFixed(2)}%
| 예금일: ${formatted_depositDate}
| 만기일: ${formatted_maturityDate}`;
            }
            for (const savings_account of result.data.asset.savings_accounts) {
                if (deposit_format !== '') deposit_format += '\n';
                const formattedStartDate = moment(savings_account.startDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedEndDate = moment(savings_account.endDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                deposit_format += `적금 ${savings_account.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 상품: ${savings_account.product}
| 이자율: ${(savings_account.interestRate * 100).toFixed(2)}%
| 가입일: ${formattedStartDate}
| 만기일: ${formattedEndDate}`;
            }
        } else {
            for (const fixed_deposit of result.data.asset.fixed_deposits) {
                if (deposit_format !== '') deposit_format += '\n';
                deposit_format += `예금 ${fixed_deposit.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (이자율: ${(fixed_deposit.interestRate * 100).toFixed(2)}%)`;
            }
            for (const savings_account of result.data.asset.savings_accounts) {
                if (deposit_format !== '') deposit_format += '\n';
                deposit_format += `적금 ${savings_account.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (이자율: ${(savings_account.interestRate * 100).toFixed(2)}%)`;
            }
        }

        if (deposit_format !== '') {
            fields.push({
                name: ':moneybag:  예금 / :calendar:  적금',
                value: `\`\`\`${deposit_format}\`\`\``,
            });
        }

        let loan_format = '';
        if (loadDetails) {
            for (const loan of result.data.asset.loans) {
                if (loan_format !== '') loan_format += '\n';
                const formattedLoanDate = moment(loan.loanDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedDueDate = moment(loan.dueDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                loan_format += `대출 ${loan.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 이자율: ${(loan.interestRate * 100).toFixed(2)}%
| 대출일: ${formattedLoanDate}
| 상환일: ${formattedDueDate}`;
            }
        } else {
            for (const loan of result.data.asset.loans) {
                if (loan_format !== '') loan_format += '\n';
                loan_format += `대출 ${loan.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (이자율: ${(loan.interestRate * 100).toFixed(2)}%)`;
            }
        }

        if (loan_format !== '') {
            fields.push({
                name: ':money_with_wings:  대출',
                value: `\`\`\`${loan_format}\`\`\``,
            });
        }

        
        let fund_format = '';
        if (loadDetails) {
            for (const fund of result.data.asset.funds) {
                if (fund_format !== '') fund_format += '\n';
                const formattedPurchaseDate = moment(fund.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const investmentAmount = fund.unit * fund.purchasePrice;

                const currentFundPrice = getFundPrice(fund.name);
                if (currentFundPrice === null) {
                    fund_format += `${fund.name} 펀드 ${investmentAmount.toLocaleString()}원\n| 좌수: ${fund.unit.toLocaleString()}\n| 매수날짜: ${formattedPurchaseDate}\n| (가격 정보 없음)`;
                    continue;
                }

                const earnRate = (currentFundPrice - fund.purchasePrice) / fund.purchasePrice;
                let earnSign = earnRate > 0 ? '+' : '';

                totalEarn += fund.unit * (currentFundPrice - fund.purchasePrice);

                const currentValue = fund.unit * currentFundPrice;
                fund_format += `${fund.name} 펀드 ${Math.round(currentValue).toLocaleString()}원
| 평가손익: ${(fund.unit * (currentFundPrice - fund.purchasePrice)).toFixed(2).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(earnRate * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2)}%)
| 좌수: ${fund.unit.toLocaleString()}
| 매수날짜: ${formattedPurchaseDate}
| 현재가격: ${Math.round(currentFundPrice).toLocaleString()}원
| 매수가격: ${Math.round(fund.purchasePrice).toLocaleString()}원`;
            }
        } else {
            for (const fund of result.data.asset.funds) {
                if (fund_format !== '') fund_format += '\n';
                const investmentAmount = fund.unit * fund.purchasePrice;
                const currentFundPrice = getFundPrice(fund.name);

                if (currentFundPrice === null) {
                    fund_format += `${fund.name} 펀드 ${investmentAmount.toLocaleString()}원 (${fund.unit.toLocaleString()}좌, 가격 정보 없음)`;
                    continue;
                }

                const earnRate = (currentFundPrice - fund.purchasePrice) / fund.purchasePrice;
                let earnSign = earnRate > 0 ? '+' : '';

                totalEarn += fund.unit * (currentFundPrice - fund.purchasePrice);

                fund_format += `${fund.name} 펀드 ${fund.unit.toLocaleString()}좌 (평가손익: ${(fund.unit * (currentFundPrice - fund.purchasePrice)).toFixed(2).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(earnRate * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2)}%))`;
            }
        }

        if (fund_format !== '') {
            fields.push({
                name: ':bar_chart:  펀드',
                value: `\`\`\`${fund_format}\`\`\``,
            });
        }
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(embedTitle)
                    .addFields(fields)
                    .setTimestamp()
            ]
        });
    }
}