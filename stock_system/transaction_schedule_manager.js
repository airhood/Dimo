const { getTransactionScheduleData, OPTION_UNIT_QUANTITY, deleteTransactionSchedule } = require("../database");
const { setOnFutureExpireListener, setOnOptionExpireListener, getStockPrice } = require("./stock_sim");
const { program } = require('commander');
const { serverLog } = require("../server/server_logger");
const schedule = require('node-schedule');

const future_execute_list = {};
const option_execute_list = {};

const schedule_job_list = {};

function dateToCron(date) {
    const second = date.getSeconds();
    const minute = date.getMinutes();
    const hour = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1;

    return `${second} ${minute} ${hour} ${dayOfMonth} ${month} *`;
}

async function cacheTransactionScheduleData() {
    const data = await getTransactionScheduleData();

    if (data === false) {
        return false;
    } else if (data !== null) {
        const result = Promise.all(data.map(async (transaction_schedule) => {
            console.log(`command: ${transaction_schedule.command}`);
            const commandArgs = transaction_schedule.command.split(' ');
            commandArgs.push('|', transaction_schedule.identification_code);

            try {
                await program.parseAsync(commandArgs, { from: 'user' });
            } catch (err) {
                serverLog(`[ERROR] Error at 'transaction_schedule_manager.js:cacheTransactionScheduleData': ${err}`);
            }
        }));
        return true;
    }
    return false;
}

const Asset = require('../schemas/asset');
const { calculateCompoundInterestRate, getLoanInterestRate } = require("./bank_manager");

module.exports = {
    async initScheduleManager() {
        program.command('buyback stock <id> <asset_id> <uid> at <date> | <identification_code>')
            .action((id, asset_id, uid, date, identification_code) => {
                const dateObj = new Date();
                dateObj.setTime(date);
                const job = schedule.scheduleJob(dateToCron(dateObj), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    let index;
                    let short;
                    userAsset.stockShortSales.forEach((element, _index) => {
                        if (element.uid === uid) {
                            short = element;
                            index = _index;
                        }
                    });

                    const quantity = short.quantity;

                    let quantityLeft = short.quantity;

                    for (let i = 0; i < userAsset.stocks.length; i++) {
                        const stock = userAsset.stocks[i];
                        if (stock.ticker === short.ticker) {
                            if (stock.quantity > quantityLeft) {
                                stock.quantity -= quantityLeft;
                                quantityLeft = 0;
                                break;
                            } else if (stock.quantity === quantityLeft) {
                                userAsset.stocks.splice(i, 1);
                                quantityLeft = 0;
                                break;
                            } else if (stock.quantity < quantityLeft) {
                                quantityLeft -= stock.quantity;
                                userAsset.stocks.splice(i, 1);
                                i--;
                            }
                        }
                    }

                    const currentPrice = getStockPrice(short.ticker);

                    if (quantityLeft > 0) {
                        const transactionAmount = currentPrice * quantityLeft;
                        
                        userAsset.balance -= transactionAmount;
                        userAsset.balance = Math.round(userAsset.balance);
                    }

                    userAsset.stockShortSales.splice(index, 1);

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                        error = true;
                        return null;
                    }

                    const result = deleteTransactionSchedule(`${id}-short_${uid}`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }

                    serverLog(`[INFO] Buyback ${short.quantity} shares of ${short.ticker} stock. asset_id: ${asset_id}`);
                    return true;
                });

                schedule_job_list[identification_code] = job;
            });
        
        program.command('execute_future <id> <asset_id> | <identification_code>')
            .action((id, asset_id, identification_code) => {
                const transaction_schedule = {
                    id: id,
                    asset_id: asset_id,
                };
        
                future_execute_list[identification_code] = transaction_schedule;
            });
        
        program.command('execute_option <id> <asset_id> | <identification_code>')
            .action((id, asset_id, identification_code) => {
                const transaction_schedule = {
                    id: id,
                    asset_id: asset_id,
                };

                option_execute_list[identification_code] = transaction_schedule;
            });
        
        program.command('execute_binary_option <id> <asset_id> <uid> <expiration_date> | <identification_code>')
            .action((id, asset_id, uid, expiration_date, identification_code) => {
                const dateObj = new Date();
                dateObj.setTime(expiration_date);
                const job = schedule.scheduleJob(dateToCron(dateObj), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    let index;
                    let binaryOption;
                    userAsset.binary_options.forEach((element, _index) => {
                        if (element.uid === uid) {
                            short = element;
                            index = _index;
                        }
                    });
                    
                    const currentPrice = getStockPrice(binaryOption.ticker);

                    if (binaryOption.optionType === 'call') {
                        if (currentPrice > binaryOption.strikePrice) {
                            const transactionAmount = binaryOption.amount * 1.8;

                            userAsset.balance += transactionAmount;
                            userAsset.balance = Math.round(userAsset.balance);
                        } else if (currentPrice < binaryOption.strikePrice) {

                        } else if (currentPrice === binaryOption.strikePrice) {
                            const transactionAmount = binaryOption.amount;
                            
                            userAsset.balance += transactionAmount;
                            userAsset.balance = Math.round(userAsset.balance);
                        }
                    } else if (binaryOption.optionType === 'put') {
                        if (currentPrice > binaryOption.strikePrice) {

                        } else if (currentPrice < binaryOption.strikePrice) {
                            const transactionAmount = binaryOption.amount * 1.8;

                            userAsset.balance += transactionAmount;
                            userAsset.balance = Math.round(userAsset.balance);
                        } else if (currentPrice === binaryOption.strikePrice) {
                            const transactionAmount = binaryOption.amount;
                            
                            userAsset.balance += transactionAmount;
                            userAsset.balance = Math.round(userAsset.balance);
                        }
                    }

                    userAsset.binary_options.splice(index, 1);

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                        error = true;
                        return null;
                    }

                    const result = deleteTransactionSchedule(`${id}_binary_option_${uid}`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }

                    serverLog(`[INFO] Executed ${binaryOption.ticker} ${binaryOption.optionType} binary option. asset_id: ${asset_id}`);
                    return true;
                });

                schedule_job_list[identification_code] = job;
            });
        
        program.command('repay_loan <id> <asset_id> <uid> at <date> | <identification_code>')
            .action((id, asset_id, uid, date, identification_code) => {
                const dateObj = new Date();
                dateObj.setTime(date);
                const job = schedule.scheduleJob(dateToCron(dateObj), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    let index;
                    let loan;
                    userAsset.loans.forEach((element, _index) => {
                        if (element.uid === uid) {
                            short = element;
                            index = _index;
                        }
                    });

                    userAsset.balance -= loan.amount;

                    let interestRate = loan.interestRate;
                    if (interestRate === 0) {
                        interestRate = getLoanInterestRate();
                    }

                    userAsset.balance -= loan.amount * interestRate * loan.days;
                    userAsset.balance = Math.round(userAsset.balance);

                    userAsset.loans.splice(index, 1);

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                        error = true;
                        return null;
                    }

                    const result = deleteTransactionSchedule(`${id}-loan_${uid}`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }

                    serverLog(`[INFO] Repay ${amount} amount of money. asset_id: ${asset_id}`);
                    return true;
                });

                schedule_job_list[identification_code] = job;
            });
        
        program.command('pay_interest_fixed_deposit <id> <asset_id> <uid> at <date> | <identification_code>')
            .action((id, asset_id, uid, date, identification_code) => {
                const dateObj = new Date();
                dateObj.setTime(date);
                const job = schedule.scheduleJob(dateToCron(dateObj), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    let index;
                    let fixed_deposit;
                    userAsset.fixed_deposits.forEach((element, _index) => {
                        if (element.uid === uid) {
                            short = element;
                            index = _index;
                        }
                    });

                    const transactionAmount = fixed_deposit.amount * (fixed_deposit.interestRate * fixed_deposit.product);

                    userAsset.balance += transactionAmount;

                    userAsset.fixed_deposits.splice(index, 1);

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                        error = true;
                        return null;
                    }

                    const result = deleteTransactionSchedule(`${id}-fixed_deposit_${uid}`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }

                    serverLog(`[INFO] Pay interest on ${amount} amount of fixed deposit. asset_id: ${asset_id}`);
                    return true;
                });

                schedule_job_list[identification_code] = job;
            });
        
        program.command('pay_interest_savings_account <id> <asset_id> <uid> at <date> | <identification_code>')
            .action((id, asset_id, uid, date, identification_code) => {
                const dateObj = new Date();
                dateObj.setTime(date);
                const job = schedule.scheduleJob(dateToCron(dateObj), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    let index;
                    let savings_account;
                    userAsset.savings_accounts.forEach((element, _index) => {
                        if (element.uid === uid) {
                            short = element;
                            index = _index;
                        }
                    });

                    const compoundInterest = calculateCompoundInterestRate(savings_account.interestRate, savings_account.product);
                    const transactionAmount = savings_account.amount * compoundInterest;

                    userAsset.balance += transactionAmount;

                    userAsset.savings_accounts.splice(index, 1);

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                        error = true;
                        return null;
                    }

                    const result = deleteTransactionSchedule(`${id}-savings_account_${uid}`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }

                    serverLog(`[INFO] Pay interest on ${amount} amount of savings account. asset_id: ${asset_id}`);
                    return true;
                });

                schedule_job_list[identification_code] = job;
            });
        
        program.command('pay_money_savings_account <id> <asset_id> <uid> <cycle> at <date> | <identification_code>')
            .action((id, asset_id, uid, cycle, date, identification_code) => {
                const dateObj = new Date();
                dateObj.setTime(date);
                const job = schedule.scheduleJob(dateToCron(dateObj), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    let index;
                    let savings_account;
                    userAsset.savings_accounts.forEach((element, _index) => {
                        if (element.uid === uid) {
                            short = element;
                            index = _index;
                        }
                    });

                    if (userAsset.balance < savings_account.amount) {
                        serverLog(`[INFO] Pay ${amount} amount of money to savings account failed. No money. asset_id: ${asset_id}`);

                        userAsset.balance += savings_account.amount * cycle;
                        userAsset.balance = Math.round(userAsset.balance);

                        for (let del_cycle = cycle; del_cycle < savings_account.product; del_cycle++) {
                            const result = await deleteTransactionSchedule(`${id}-savings_account_${uid}_${del_cycle}`);
                            if (!result) {
                                serverLog('[ERROR] Delete transaction schedule failed.');
                            }
                        }

                        const saveResult = await userAsset.save();
                        if (!saveResult) {
                            serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                            error = true;
                            return null;
                        }

                        serverLog(`[INFO] Liquiated savings account. asset_id: ${asset_id}`);
                        return false;
                    }

                    userAsset.balance -= savings_account.amount;
                    userAsset.balance = Math.round(userAsset.balance);

                    const result = await deleteTransactionSchedule(`${id}-savings_account_${uid}_${cycle}`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                        error = true;
                        return null;
                    }

                    serverLog(`[INFO] Pay ${amount} amount of money to savings account success. asset_id: ${asset_id}`);
                    return true;
                });

                schedule_job_list[identification_code] = job;
            });

        const result = cacheTransactionScheduleData();
        if (!result) return false;

        setOnFutureExpireListener(async () => {
            const results = await Promise.all(future_execute_list.map(async (transaction_schedule) => {
                const userAsset = await Asset.findById(transaction_schedule.asset_id);
                if (!userAsset) {
                    serverLog('[ERROR] Error finding user');
                    return null;
                }

                let error = false;

                const futureResults = await Promise.all(userAsset.futures.map(async (future) => {
                    if (future.quantity > 0) {
                        const currentPrice = getStockPrice(future.ticker);
                        const transactionAmount = currentPrice * future.quantity;
                        
                        if (userAsset.balance < transactionAmount) {
                            serverLog(`[INFO] Buy stock failed. Not enough balance. asset_id: ${transaction_schedule.asset_id}`);
                            error = true;
                            return false;
                        }
                        
                        userAsset.balance -= transactionAmount;
                        
                        const purchaseDate = new Date();
                        
                        userAsset.stocks.push({
                            ticker: future.ticker,
                            quantity: future.quantity,
                            purchasePrice: future.purchasePrice,
                            purchaseDate: purchaseDate,
                        });
        
                        serverLog(`[INFO] Buy ${future.quantity}shares of '${future.ticker}' stock by future success. asset_id: ${transaction_schedule.asset_id}`);
                        return true;
                    } else if (future.quantity < 0) {
                        const currentPrice = getStockPrice(future.ticker);
                        
                        const transactionAmount = currentPrice * Math.abs(future.quantity);

                        userAsset.balance -= transactionAmount;

                        serverLog(`[INFO] Sell ${future.quantity}shares of '${future.ticker}' stock by future success. asset_id: ${transaction_schedule.asset_id}`);
                        return true;
                    }
                }));

                if (!error) {
                    serverLog(`[ERROR] Failed to execute future. asset_id: ${transaction_schedule.asset_id}`);
                } else {
                    userAsset.futures = [];

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${transaction_schedule.asset_id}`);
                        error = true;
                        return null;
                    }

                    const result = await deleteTransactionSchedule(`${transaction_schedule.id}_future`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }

                    serverLog(`[INFO] Future execute process success. asset_id: ${transaction_schedule.asset_id}}`);
                }
            }));
        });

        setOnOptionExpireListener(async () => {
            const results = await Promise.all(option_execute_list.map(async (transaction_schedule) => {
                const userAsset = await Asset.findById(transaction_schedule.asset_id);
                if (!userAsset) {
                    serverLog('[ERROR] Error finding user');
                    return null;
                }

                let error = false;

                const optionResults = await Promise.all(userAsset.options.map(async (option, index) => {
                    if (option.optionType === 'call') {
                        const currentPrice = getStockPrice(option.ticker);
                        if (currentPrice > option.strikePrice) {
                            const transactionAmount = option.strikePrice * option.quantity * OPTION_UNIT_QUANTITY;
                            if (userAsset.balance >= transactionAmount) {
                                const purchaseDate = new Date();

                                userAsset.stocks.push({
                                    ticker: option.ticker,
                                    quantity: option.quantity * OPTION_UNIT_QUANTITY,
                                    purchasePrice: option.strikePrice,
                                    purchaseDate: purchaseDate,
                                });
    
                                userAsset.balance -= transactionAmount;
                                userAsset.balance = Math.round(userAsset.balance);
        
                                serverLog(`[INFO] Buy ${option.quantity * OPTION_UNIT_QUANTITY}shares of '${option.ticker}' stock at price ${option.strikePrice} by option success. asset_id: ${transaction_schedule.asset_id}`);
                            }
                        }
                    } else if (option.optionType === 'put') {
                        const currentPrice = getStockPrice(option.ticker);
                        if (currentPrice > option.strikePrice) {
                            let holdingStockQuantity = 0;
                            userAsset.stocks.forEach((stock) => {
                                if (stock.ticker === option.ticker) {
                                    holdingStockQuantity += stock.quantity;
                                }
                            });
                            
                            let optionExecuteQuantity;
                            const optionExecuteLimit = holdingStockQuantity % OPTION_UNIT_QUANTITY;
                            if (optionExecuteLimit > option.quantity) {
                                optionExecuteQuantity = option.quantity;
                            } else {
                                optionExecuteQuantity = optionExecuteLimit;
                            }

                            const transactionQuantity = optionExecuteQuantity * OPTION_UNIT_QUANTITY;
                            const transactionAmount = option.strikePrice * transactionQuantity;

                            let quantityLeft = transactionQuantity;

                            for (let i = 0; i < userAsset.stocks.length; i++) {
                                const stock = userAsset.stocks[i];
                                if (stock.ticker === option.ticker) {
                                    if (stock.quantity > quantityLeft) {
                                        stock.quantity -= quantityLeft;
                                        quantityLeft = 0;
                                        break;
                                    } else if (stock.quantity === quantityLeft) {
                                        userAsset.stocks.splice(i, 1);
                                        quantityLeft = 0;
                                        break;
                                    } else if (stock.quantity < quantityLeft) {
                                        quantityLeft -= stock.quantity;
                                        userAsset.stocks.splice(i, 1);
                                        i--;
                                    }
                                }
                            }

                            if (quantityLeft !== 0) {
                                serverLog(`[ERROR] Option execute optionExecuteQuantity calculation error. Wrong value. asset_id: ${transaction_schedule.asset_id}`);
                                return null;
                            }

                            userAsset.balance += transactionAmount;
                            userAsset.balance = Math.round(userAsset.balance);

                            serverLog(`[INFO] Buy ${option.quantity * OPTION_UNIT_QUANTITY}shares of '${option.ticker}' stock at price ${option.strikePrice} by option success. asset_id: ${transaction_schedule.asset_id}`);
                        }
                    }

                    userAsset.options.splice(index, 1);
                }));

                if (!error) {
                    serverLog(`[ERROR] Failed to execute option. asset_id: ${transaction_schedule.asset_id}`);
                } else {
                    userAsset.options = [];
    
                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${transaction_schedule.asset_id}`);
                        error = true;
                        return null;
                    }
    
                    const result = await deleteTransactionSchedule(`${transaction_schedule.id}_option`);
                    if (!result) {
                        serverLog('[ERROR] Delete transaction schedule failed.');
                        return null;
                    }
    
                    serverLog(`[INFO] Option execute process success. asset_id: ${transaction_schedule.asset_id}}`);
                }
            }));
        });

        return true;
    },

    async addTransactionScheduleData(transaction_schedule) {
        if (!transaction_schedule) return;
        const commandArgs = transaction_schedule.command.split(' ');
        commandArgs.push('|', transaction_schedule.identification_code);

        try {
            await program.parseAsync(commandArgs, { from: 'user' });
        } catch (err) {
            serverLog(`[ERROR] Error at 'transaction_schedule_manager.js:addTransactionScheduleData': ${err}`);
        }
    },

    async deleteTransactionScheduleData(identification_code) {
        if (future_execute_list[identification_code] !== undefined) {
            delete future_execute_list[identification_code];
        } else if (option_execute_list[identification_code] !== undefined) {
            delete future_execute_list[identification_code];
        } else {
            schedule_job_list[identification_code].cancel();
            delete schedule_job_list[identification_code];
        }
    }
}