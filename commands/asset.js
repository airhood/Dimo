const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, getUserAsset } = require('../database');
const moment = require('moment-timezone');
const { getStockPrice, getFuturePrice, getCallOptionPrice, getPutOptionPrice } = require('../stock_system/stock_sim');
const asset = require('../schemas/asset');

const ROUND_POS = 1;

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

        const userExists = await checkUserExists(targetUser.id);

        if (userExists === false) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('계정이 없습니다')
                        .setDescription('가입된 계정이 없습니다.\n회원가입은 **/회원가입** 을 통해 가능합니다.')
                ],
            });
            return;
        }

        const result = await getUserAsset(targetUser.id);

        if (!loadDetails) {
            const stocksMap = new Map();
            result.asset.stocks.forEach(stock => {
                if (stocksMap.has(stock.ticker)) {
                    const existingStock = stocksMap.get(stock.ticker);
                    existingStock.quantity += stock.quantity;
                } else {
                    stocksMap.set(stock.ticker, JSON.parse(JSON.stringify(stock)));
                }
            });
            const mergedStocks = [...stocksMap.values()];
            
            const futuresMap = new Map();
            result.asset.futures.forEach(future => {
                const key = `${future.contract}-${future.expirationDate}`;
                if (futuresMap.has(key)) {
                    const existingFuture = futuresMap.get(key);
                    existingFuture.quantity += future.quantity;
                } else {
                    futuresMap.set(key, JSON.parse(JSON.stringify(future)));
                }
            });
            const mergedFutures = [...futuresMap.values()];
            
            const optionsMap = new Map();
            result.asset.options.forEach(option => {
                const key = `${option.contract}-${option.optionType}-${option.strikePrice}`;
                if (optionsMap.has(key)) {
                    const existingOption = optionsMap.get(key);
                    existingOption.quantity += option.quantity;
                } else {
                    optionsMap.set(key, JSON.parse(JSON.stringify(option)));
                }
            });
            const mergedOptions = [...optionsMap.values()];

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
                fixed_deposits: mergedFixedDeposits,
                savings_accounts: mergedSavingsAccounts,
                loans: mergedLoans,
            };

            result.asset = mergedAsset;
        }

        if (result === false) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('오류가 발생했습니다')
                        .setDescription('디모봇 관리자(airhood_dev)에게 문의해주세요.')
                ]
            });
        }

        const fields = [
            {
                name: ':dollar:  계좌 잔액',
                value: `\`\`\`${result.asset.balance}원\`\`\``,
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

                stock_format += `${stock.ticker} ${stock.quantity}주
| 현재가격: ${getStockPrice(stock.ticker)}원
| 매수가격: ${stock.purchasePrice}원
| 평가손익: ${getStockPrice(stock.ticker) - stock.purchasePrice}원 (${earnSign}${Math.round(((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%)
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

                stock_format += `${short.ticker} ${-short.quantity}주
| 현재가격: ${getStockPrice(short.ticker)}원
| 매도가격: ${short.sellPrice}원
| 평가손익: ${short.sellPrice - getStockPrice(short.ticker)}원 (${earnSign}${Math.round(((short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%)
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

                stock_format += `${stock.ticker} ${stock.quantity}주 (평가손익: ${getStockPrice(stock.ticker) - stock.purchasePrice}원 (${earnSign}${Math.round(((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%))`;
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

                stock_format += `${short.ticker} ${-short.quantity}주 (평가손익: ${short.sellPrice - getStockPrice(short.ticker)}원 (${earnSign}${Math.round(((short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%))`;
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

                const earn = (getFuturePrice(future.ticker) - future.purchasePrice) / future.purchaseDate;
                let earnSign;
                if (earn > 0) {
                    earnSign = '+';
                } else if (earn === 0) {
                    earnSign = '';
                } else if (earn < 0) {
                    earnSign = '';
                }

                future_format += `${future.contract} ${future.quantity}계약
| 현재가격: ${getFuturePrice(future.ticker)}원
| 매수가격: ${future.purchasePrice}원
| 평가손익: ${getFuturePrice(future.ticker) - future.purchasePrice}원 (${earnSign}${Math.round(((getFuturePrice(future.ticker) - future.purchasePrice) / future.purchaseDate) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%)
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate})`;
            }
        } else {
            
            for (future of result.asset.futures) {
                if (future_format !== '') future_format += '\n';

                const earnRate = (getFuturePrice(future.ticker) - future.purchasePrice) / future.purchaseDate;
                let earnSign;
                if (earnRate > 0) {
                    earnSign = '+';
                } else if (earnRate === 0) {
                    earnSign = '';
                } else if (earnRate < 0) {
                    earnSign = '';
                }

                future_format += `${future.contract} ${future.quantity}계약 (평가손익: ${getFuturePrice(future.ticker) - future.purchasePrice}원 (${earnSign}${Math.round(((getFuturePrice(future.ticker) - future.purchasePrice) / future.purchaseDate) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%))`;
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
                let currentPrice;
                if (option.optionType === 'call') {
                    formattedOptionType = '콜';
                    currentPrice = getCallOptionPrice(option.ticker);
                } else if (option.optionType === 'put') {
                    formattedOptionType = '풋';
                    currentPrice = getPutOptionPrice(option.ticker);
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
                option_format += `${option.contract} ${formattedOptionType}옵션 ${option.quantity}계약
| 현재가격: ${currentPrice}원
| 매수가격: ${option.purchasePrice}원
| 평가손익: ${currentPrice - option.purchasePrice}원 (${Math.round(((currentPrice - option.purchasePrice) / option.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%)
| 행사가격: ${option.strikePrice}원
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate})`;
            }
        } else {
            for (option of result.asset.options) {
                if (option_format !== '') option_format += '\n\n';
                let formattedOptionType;
                let currentPrice;
                if (option.optionType === 'call') {
                    formattedOptionType = '콜';
                    currentPrice = getCallOptionPrice(option.ticker);
                } else if (option.optionType === 'put') {
                    formattedOptionType = '풋';
                    currentPrice = getPutOptionPrice(option.ticker);
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
                option_format += `${option.contract} ${formattedOptionType}옵션 ${option.quantity}계약 (평가손익: ${currentPrice - option.purchasePrice}원 (${Math.round(((currentPrice - option.purchasePrice) / option.purchasePrice) * Math.pow(10, ROUND_POS)) / Math.pow(10, ROUND_POS)}%))`;
            }
        }

        if (option_format !== '') {
            fields.push({
                name: ':pencil:  옵션',
                value: `\`\`\`${option_format}\`\`\``,
            });
        }

        let deposit_format = '';
        if (loadDetails) {
            for (fixed_deposit of result.asset.fixed_deposits) {
                if (deposit_format !== '') deposit_format += '\n';
                deposit_format += `예금 ${fixed_deposit.amount}원
| 상품: ${fixed_deposit.product}
| 이자율: ${fixed_deposit.interestRate}%
| 예금일: ${fixed_deposit.depositDate}
| 만기일: ${fixed_deposit.maturityDate})`;
            }
            for (savings_account of result.asset.savings_accounts) {
                if (deposit_format !== '') deposit_format += '\n';
                deposit_format += `적금 ${savings_account.amount}원
| 상품: ${savings_account.product}
| 이자율: ${savings_account.interestRate}%
| 가입일: ${savings_account.startDate}
| 만기일: ${savings_account.endDate})`;
            }
        }

        if (deposit_format !== '') {
            fields.push({
                name: ':moneybag:  예금 / :calendar:  적금',
                value: `\`\`\`${deposit_format}\`\`\``,
            });
        }

        let loan_format = '';
        for (loan of result.asset.loans) {
            if (loan_format !== '') loan_format += '\n\n';
            loan_format += `대출 ${loan.amount}원
| 이자율: ${loan.interestRate}%
| 대출일: ${loan.loanDate}
| 상환일: ${loan.dueDate})`;
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