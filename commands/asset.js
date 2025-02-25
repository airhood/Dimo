const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, getUserAsset, binaryOption, OPTION_UNIT_QUANTITY } = require('../database');
const moment = require('moment-timezone');
const { getStockPrice, getFuturePrice, getCallOptionPrice, getPutOptionPrice, getOptionPrice, getOptionStrikePriceIndex } = require('../stock_system/stock_sim');
const asset = require('../schemas/asset');

const ROUND_POS = 3;

function mergePositions(existingQuantity, existingPurchasePrice, newQuantity, newPurchasePrice) {
    const totalQuantity = existingQuantity + newQuantity;
    
    const newAveragePrice = (existingPurchasePrice * existingQuantity + newPurchasePrice * newQuantity) / totalQuantity;

    return { totalQuantity, newAveragePrice };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('자산')
        .setDescription('가지고 있는 자산을 표시합니다.')
        .addUserOption((option) =>
            option.setName('유저')
                .setDescription('자신을 불러올 유저')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option.setName('상세정보')
                .setDescription('자산의 상세정보 표시 여부')
                .addChoices(
                    { name: '표시', value: '표시' },
                    { name: '숨기기', value: '숨기기' },
                )
                .setRequired(false)
        )
        ,
    
    async execute(interaction) {
        let targetUser = interaction.options.getUser('유저');
        let loadDetails = interaction.options.getString('상세정보');
        
        if (targetUser === null) {
            targetUser = interaction.user;
        }

        if (loadDetails === '표시') {
            loadDetails = true;
        }
        else if (loadDetails === '숨기기') {
            loadDetails = false;
        }
        else if (loadDetails === null) {
            loadDetails = false;
        }

        const result = await getUserAsset(targetUser.id);

        if (result === false) {
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

        /*
        if (!loadDetails) {
            const stocksMap = new Map();
            result.asset.stocks.forEach(stock => {
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
            result.asset.futures.forEach(future => {
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
            result.asset.options.forEach(option => {
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

            const binary_options = [...result.asset.binary_options];
            const mergedFixedDeposits = [...result.asset.fixed_deposits];
            const mergedSavingsAccounts = [...result.asset.savings_accounts];
            const mergedLoans = [...result.asset.loans];
            
            const mergedAsset = {
                user: result.asset.user,
                balance: result.asset.balance,
                stocks: mergedStocks,
                stockShortSales: result.asset.stockShortSales,
                futures: mergedFutures,
                options: mergedOptions,
                binary_options: binary_options,
                fixed_deposits: mergedFixedDeposits,
                savings_accounts: mergedSavingsAccounts,
                loans: mergedLoans,
            };

            result.asset = mergedAsset;
        }
        */

        const fields = [
            {
                name: ':dollar:  계좌 잔액',
                value: `\`\`\`${result.asset.balance.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원\`\`\``,
            }
        ];


        let stock_format = '';

        if (loadDetails) {
            for (stock of result.asset.stocks) {
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

                stock_format += `${stock.ticker} ${stock.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주
| 현재가격: ${getStockPrice(stock.ticker).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매수가격: ${stock.purchasePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 매수날짜: ${formattedPurchaseDate}`;
            }

            if (result.asset.stockShortSales.length > 0) {
                stock_format += '\n\n----- 공매도 -----';
            }

            for (short of result.asset.stockShortSales) {
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

                stock_format += `${short.ticker} ${-short.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주
| 현재가격: ${getStockPrice(short.ticker).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매도가격: ${short.sellPrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(stock.quantity * (short.sellPrice - getStockPrice(short.ticker))).toFixed().toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(((short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 상환일: ${formattedBuyBackDate}
| 매도날짜: ${formattedSellDate}`;
            }
        } else {
            for (stock of result.asset.stocks) {
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

                stock_format += `${stock.ticker} ${stock.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주 (평가손익: ${(stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round(((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
            }

            if (result.asset.stockShortSales.length > 0) {
                stock_format += '\n\n----- 공매도 -----';
            }

            for (short of result.asset.stockShortSales) {
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
            for (future of result.asset.futures) {
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

                future_format += `${future.ticker} ${positionType} ${Math.abs(future.quantity).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약
| 현재가격: ${getFuturePrice(future.ticker).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매수가격: ${future.purchasePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(future.quantity * future.leverage * (getFuturePrice(future.ticker) - future.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${((Math.round((((getFuturePrice(future.ticker) - future.purchasePrice) * future.leverage * earnDirection) / future.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate}`;
            }
        } else {
            
            for (future of result.asset.futures) {
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
            for (option of result.asset.options) {
                if (option_format !== '') option_format += '\n\n';
                let formattedOptionType;
                const optionPrices = getOptionPrice(option.ticker);
                const strikePriceIndex = getOptionStrikePriceIndex(option.ticker, option.strikePrice);
                if (strikePriceIndex === null) continue;

                let currentPrice;
                if (option.optionType === 'call') {
                    formattedOptionType = '콜';
                    currentPrice = optionPrices.call[strikePriceIndex];
                } else if (option.optionType === 'put') {
                    formattedOptionType = '풋';
                    currentPrice = optionPrices.put[strikePriceIndex];
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
                option_format += `${option.ticker} ${formattedOptionType}옵션 ${option.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약
| 현재가격: ${currentPrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 매수가격: ${option.purchasePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 평가손익: ${(option.quantity * (currentPrice - option.purchasePrice) * OPTION_UNIT_QUANTITY).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${((Math.round(((currentPrice - option.purchasePrice) / option.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)) * 100).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 행사가격: ${option.strikePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate}`;
            }
        } else {
            for (option of result.asset.options) {
                if (option_format !== '') option_format += '\n\n';
                let formattedOptionType;
                const optionPrices = getOptionPrice(option.ticker);
                const strikePriceIndex = getOptionStrikePriceIndex(option.ticker, option.strikePrice);
                if (strikePriceIndex === null) continue;
                
                let currentPrice;
                if (option.optionType === 'call') {
                    formattedOptionType = '콜';
                    currentPrice = optionPrices.call[strikePriceIndex];
                } else if (option.optionType === 'put') {
                    formattedOptionType = '풋';
                    currentPrice = optionPrices.put[strikePriceIndex];
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

                if (option.optionType === 'call') formattedOptionType = '콜';
                else if (option.optionType === 'put') formattedOptionType = '풋';
                const formattedExpirationDate = moment(option.expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedPurchaseDate = moment(option.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
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
            for (binary_option of result.asset.binary_options) {
                if (binary_option_format !== '') binary_option_format += '\n';

                let direction;
                if (binary_option.optionType === 'call') {
                    direction = '상승';
                } else if (binary_option.optionType === 'put') {
                    direction = '하락';
                }

                const currentPrice = getStockPrice(binary_option.ticker);

                const formattedExpirationDate = moment(binary_option.expirationDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formattedPurchaseDate = moment(binary_option.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

                binary_option_format += `${binary_option.ticker} ${direction} ${binary_option.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 배팅
| 현재가격: ${currentPrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 기준가격: ${binary_option.strikePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 만기일: ${formattedExpirationDate}
| 배팅날짜: ${formattedPurchaseDate}`;
            }
        } else {
            for (binary_option of result.asset.binary_options) {
                if (binary_option_format !== '') binary_option_format += '\n';

                let direction;
                if (binary_option.optionType === 'call') {
                    direction = '상승';
                } else if (binary_option.optionType === 'put') {
                    direction = '하락';
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
            for (fixed_deposit of result.asset.fixed_deposits) {
                if (deposit_format !== '') deposit_format += '\n';
                const formatted_depositDate = moment(fixed_deposit.depositDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formatted_maturityDate = moment(fixed_deposit.maturityDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                deposit_format += `예금 ${fixed_deposit.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 상품: ${fixed_deposit.product}
| 이자율: ${(fixed_deposit.interestRate * 100).toFixed(2)}%
| 예금일: ${formatted_depositDate}
| 만기일: ${formatted_maturityDate}`;
            }
            for (savings_account of result.asset.savings_accounts) {
                if (deposit_format !== '') deposit_format += '\n';
                const formatted_startDate = moment(savings_account.startDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formatted_endDate = moment(savings_account.endDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                deposit_format += `적금 ${savings_account.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 상품: ${savings_account.product}
| 이자율: ${(savings_account.interestRate * 100).toFixed(2)}%
| 가입일: ${formatted_startDate}
| 만기일: ${formatted_endDate}`;
            }
        } else {
            for (fixed_deposit of result.asset.fixed_deposits) {
                if (deposit_format !== '') deposit_format += '\n';
                deposit_format += `예금 ${fixed_deposit.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (이자율: ${(fixed_deposit.interestRate * 100).toFixed(2)}%)`;
            }
            for (savings_account of result.asset.savings_accounts) {
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
            for (loan of result.asset.loans) {
                if (loan_format !== '') loan_format += '\n';
                const formatted_loanDate = moment(loan.loanDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                const formatted_dueDate = moment(loan.dueDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
                loan_format += `대출 ${loan.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 이자율: ${(loan.interestRate * 100).toFixed(2)}%
| 대출일: ${formatted_loanDate}
| 상환일: ${formatted_dueDate}`;
            }
        } else {
            for (loan of result.asset.loans) {
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
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(`:bank:  자산 [${targetUser.username}]`)
                .addFields(fields)
                .setTimestamp()
            ]
        });
    }
}