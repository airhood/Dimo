const moment = require('moment-timezone');
const { getStockPrice, getFuturePrice, getOptionPrice } = require('../systems/stock_sim');
const { getRealtimeFundPrice } = require('../systems/fund_price');
const { getEtfPrice, getEtfNavPrice, ETF_DEFINITIONS } = require('../systems/etf_system');
const { OPTION_UNIT_QUANTITY } = require('../setting');
const { calcCurrentValue } = require('../systems/real_estate_system');

const ROUND_POS = 3;

// 수익률 퍼센트 포맷: 소수 2자리가 모두 0이면 처음으로 0이 아닌 숫자가 나올 때까지 자릿수 확장
function formatPercent(pct) {
    if (pct === 0) return '0.00';
    for (let digits = 2; digits <= 8; digits++) {
        const s = pct.toFixed(digits);
        const dec = s.split('.')[1] ?? '';
        if (!/^0+$/.test(dec)) return s;
    }
    return pct.toFixed(8);
}

async function buildAssetFields(assetData, loadDetails) {
    const fields = [
        {
            name: ':dollar:  계좌 잔액',
            value: `\`\`\`${assetData.balance.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원\`\`\``,
        }
    ];

    let totalEarn = 0;


    let stock_format = '';

    if (loadDetails) {
        for (const stock of assetData.stocks) {
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
| 평가손익: ${(stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 매수날짜: ${formattedPurchaseDate}`;
        }

        if (assetData.stockShortSales.length > 0) {
            stock_format += '\n\n----- 공매도 -----';
        }

        for (const short of assetData.stockShortSales) {
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
| 평가손익: ${(stock.quantity * (short.sellPrice - getStockPrice(short.ticker))).toFixed().toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent((short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 상환일: ${formattedBuyBackDate}
| 매도날짜: ${formattedSellDate}`;
        }
    } else {
        for (const stock of assetData.stocks) {
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

            stock_format += `${stock.ticker} ${stock.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주 (평가손익: ${(stock.quantity * (getStockPrice(stock.ticker) - stock.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent((getStockPrice(stock.ticker) - stock.purchasePrice) / stock.purchasePrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
        }

        if (assetData.stockShortSales.length > 0) {
            stock_format += '\n\n----- 공매도 -----';
        }

        for (const short of assetData.stockShortSales) {
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

            stock_format += `${short.ticker} ${-short.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주 (평가손익: ${(short.quantity * (short.sellPrice - getStockPrice(short.ticker))).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent((short.sellPrice - getStockPrice(short.ticker)) / short.sellPrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
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
        for (const future of assetData.futures) {
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
| 레버리지: ${future.leverage}배
| 평가손익: ${(future.quantity * future.leverage * (getFuturePrice(future.ticker) - future.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent((getFuturePrice(future.ticker) - future.purchasePrice) * future.leverage * earnDirection / future.purchasePrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate}`;
        }
    } else {
        for (const future of assetData.futures) {
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

            future_format += `${future.ticker} ${positionType} ${Math.abs(future.quantity).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약 (평가손익: ${(future.quantity * future.leverage * (getFuturePrice(future.ticker) - future.purchasePrice)).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent((getFuturePrice(future.ticker) - future.purchasePrice) * future.leverage * earnDirection / future.purchasePrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
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
        for (const option of assetData.options) {
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
| 평가손익: ${(option.quantity * (currentPrice - option.purchasePrice) * OPTION_UNIT_QUANTITY).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${formatPercent((currentPrice - option.purchasePrice) / option.purchasePrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%)
| 행사가격: ${option.strikePrice.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 만기일: ${formattedExpirationDate}
| 매수날짜: ${formattedPurchaseDate}`;
        }
    } else {
        for (const option of assetData.options) {
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

            option_format += `${option.ticker} ${formattedOptionType}옵션 ${option.quantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}계약 (평가손익: ${(option.quantity * (currentPrice - option.purchasePrice) * OPTION_UNIT_QUANTITY).toFixed(2).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${formatPercent((currentPrice - option.purchasePrice) / option.purchasePrice * 100).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}%))`;
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
        for (const binary_option of assetData.binary_options) {
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
        for (const binary_option of assetData.binary_options) {
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
        for (const fixed_deposit of assetData.fixed_deposits) {
            if (deposit_format !== '') deposit_format += '\n';
            const formatted_depositDate = moment(fixed_deposit.depositDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
            const formatted_maturityDate = moment(fixed_deposit.maturityDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
            deposit_format += `예금 ${fixed_deposit.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 상품: ${fixed_deposit.product}
| 이자율: ${(fixed_deposit.interestRate * 100).toFixed(2)}%
| 예금일: ${formatted_depositDate}
| 만기일: ${formatted_maturityDate}`;
        }
        for (const savings_account of assetData.savings_accounts) {
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
        for (const fixed_deposit of assetData.fixed_deposits) {
            if (deposit_format !== '') deposit_format += '\n';
            deposit_format += `예금 ${fixed_deposit.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (이자율: ${(fixed_deposit.interestRate * 100).toFixed(2)}%)`;
        }
        for (const savings_account of assetData.savings_accounts) {
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
        for (const loan of assetData.loans) {
            if (loan_format !== '') loan_format += '\n';
            const formattedLoanDate = moment(loan.loanDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
            const formattedDueDate = moment(loan.dueDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
            loan_format += `대출 ${loan.amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원
| 이자율: ${(loan.interestRate * 100).toFixed(2)}%
| 대출일: ${formattedLoanDate}
| 상환일: ${formattedDueDate}`;
        }
    } else {
        for (const loan of assetData.loans) {
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
        for (const fund of assetData.funds) {
            if (fund_format !== '') fund_format += '\n';
            const formattedPurchaseDate = moment(fund.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
            const investmentAmount = fund.unit * fund.purchasePrice;

            const currentFundPrice = await getRealtimeFundPrice(fund.name);
            if (currentFundPrice === null) {
                fund_format += `${fund.name} 펀드 ${investmentAmount.toLocaleString()}원\n| 좌수: ${fund.unit.toLocaleString()}\n| 매수날짜: ${formattedPurchaseDate}\n| (가격 정보 없음)`;
                continue;
            }

            const earnRate = (currentFundPrice - fund.purchasePrice) / fund.purchasePrice;
            let earnSign = earnRate > 0 ? '+' : '';

            totalEarn += fund.unit * (currentFundPrice - fund.purchasePrice);

            const currentValue = fund.unit * currentFundPrice;
            fund_format += `${fund.name} 펀드 ${Math.round(currentValue).toLocaleString()}원
| 평가손익: ${(fund.unit * (currentFundPrice - fund.purchasePrice)).toFixed(2).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent(earnRate * 100)}%)
| 좌수: ${fund.unit.toLocaleString()}
| 매수날짜: ${formattedPurchaseDate}
| 현재가격: ${Math.round(currentFundPrice).toLocaleString()}원
| 매수가격: ${Math.round(fund.purchasePrice).toLocaleString()}원`;
        }
    } else {
        for (const fund of assetData.funds) {
            if (fund_format !== '') fund_format += '\n';
            const investmentAmount = fund.unit * fund.purchasePrice;
            const currentFundPrice = await getRealtimeFundPrice(fund.name);

            if (currentFundPrice === null) {
                fund_format += `${fund.name} 펀드 ${investmentAmount.toLocaleString()}원 (${fund.unit.toLocaleString()}좌, 가격 정보 없음)`;
                continue;
            }

            const earnRate = (currentFundPrice - fund.purchasePrice) / fund.purchasePrice;
            let earnSign = earnRate > 0 ? '+' : '';

            totalEarn += fund.unit * (currentFundPrice - fund.purchasePrice);

            fund_format += `${fund.name} 펀드 ${fund.unit.toLocaleString()}좌 (평가손익: ${(fund.unit * (currentFundPrice - fund.purchasePrice)).toFixed(2).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원 (${earnSign}${formatPercent(earnRate * 100)}%))`;
        }
    }

    if (fund_format !== '') {
        fields.push({
            name: ':bar_chart:  펀드',
            value: `\`\`\`${fund_format}\`\`\``,
        });
    }


    let etf_format = '';
    if (assetData.etfs && assetData.etfs.length > 0) {
        if (loadDetails) {
            for (const etf of assetData.etfs) {
                if (etf_format !== '') etf_format += '\n';
                const def = ETF_DEFINITIONS[etf.etfId];
                const currentPrice = getEtfPrice(etf.etfId) ?? etf.purchasePrice;
                const earnRate = (currentPrice - etf.purchasePrice) / etf.purchasePrice;
                const earnSign = earnRate > 0 ? '+' : '';
                const formattedPurchaseDate = moment(etf.purchaseDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

                totalEarn += etf.quantity * (currentPrice - etf.purchasePrice);

                etf_format += `${def ? def.name : etf.etfId} ${etf.quantity.toLocaleString()}좌
| 현재가격: ${currentPrice.toLocaleString()}원
| 매수가격: ${etf.purchasePrice.toLocaleString()}원
| 평가손익: ${(etf.quantity * (currentPrice - etf.purchasePrice)).toFixed(2).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',')}원 (${earnSign}${formatPercent(earnRate * 100)}%)
| 매수날짜: ${formattedPurchaseDate}`;
            }
        } else {
            for (const etf of assetData.etfs) {
                if (etf_format !== '') etf_format += '\n';
                const def = ETF_DEFINITIONS[etf.etfId];
                const currentPrice = getEtfPrice(etf.etfId) ?? etf.purchasePrice;
                const earnRate = (currentPrice - etf.purchasePrice) / etf.purchasePrice;
                const earnSign = earnRate > 0 ? '+' : '';

                totalEarn += etf.quantity * (currentPrice - etf.purchasePrice);

                etf_format += `${def ? def.name : etf.etfId} ${etf.quantity.toLocaleString()}좌 (평가손익: ${(etf.quantity * (currentPrice - etf.purchasePrice)).toFixed(2).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',')}원 (${earnSign}${formatPercent(earnRate * 100)}%))`;
            }
        }
    }

    if (etf_format !== '') {
        fields.push({
            name: ':chart_with_upwards_trend:  ETF',
            value: `\`\`\`${etf_format}\`\`\``,
        });
    }

    let prop_format = '';
    if (assetData.properties && assetData.properties.length > 0) {
        for (const prop of assetData.properties) {
            if (prop_format !== '') prop_format += '\n';
            const currentValue = calcCurrentValue(prop);
            const pnl = currentValue - prop.purchasePrice;
            const pnlRate = (pnl / prop.purchasePrice) * 100;
            const pnlSign = pnl >= 0 ? '+' : '';
            const mortgageStr = prop.mortgage?.amount != null ? `\n| 담보대출: ${prop.mortgage.amount.toLocaleString()}원` : '';
            if (loadDetails) {
                prop_format += `${prop.name} (${prop.region} ${prop.type}, ${prop.size}평)
| 현재시세: ${currentValue.toLocaleString()}원
| 매수가격: ${prop.purchasePrice.toLocaleString()}원
| 평가손익: ${pnlSign}${pnl.toLocaleString()}원 (${pnlSign}${formatPercent(pnlRate)}%)
| 임대수익률: ${prop.rentalYield}%/3일${mortgageStr}`;
            } else {
                prop_format += `${prop.name} (${prop.region} ${prop.type}) 현시세 ${currentValue.toLocaleString()}원 (${pnlSign}${formatPercent(pnlRate)}%)`;
            }
        }
    }
    if (prop_format !== '') {
        fields.push({
            name: ':house:  부동산',
            value: `\`\`\`${prop_format}\`\`\``,
        });
    }

    return { fields, totalEarn };
}

module.exports = { buildAssetFields };
