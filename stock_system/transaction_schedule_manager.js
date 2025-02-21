const { getTransactionScheduleData, deleteTransactionSchedule, OPTION_UNIT_QUANTITY } = require("../database");
const { setFutureExpireCallback, setOptionExpireCallback, getStockPrice } = require("./stock_sim");
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

module.exports = {
    async initScheduleManager() {
        program.command('buyback stock <asset_id> <ticker> <quantity> at <date> | <identification_code>')
            .action((asset_id, ticker, quantity, date, identification_code) => {                
                const job = schedule.scheduleJob(dateToCron(new Date().setTime(date)), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    
                });

                schedule_job_list[identification_code] = job;
            });
        
        program.command('execute_future <asset_id> | <identification_code>')
            .action((asset_id, identification_code) => {
                const transaction_schedule = {
                    asset_id: asset_id,
                };
        
                future_execute_list[identification_code] = transaction_schedule;
            });
        
        program.command('execute_option <asset_id> | <identification_code>')
            .action((asset_id, identification_code) => {
                const transaction_schedule = {
                    asset_id: asset_id,
                };

                option_execute_list[identification_code] = transaction_schedule;
            });
        
        program.command('execute_binary_option <asset_id> <ticker> <prediction> <expiration_date> <amount> <strike_price> | <identification_code>')
            .action((asset_id, ticker, prediction, expiration_date, amount, strike_price, identification_code) => {
                const job = schedule.scheduleJob(dateToCron(new Date().setDate(expiration_date)), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }


                });

                schedule_job_list[identification_code] = job;
            });
        
        program.command('repay money <asset_id> <amount> at <date> | <identification_code>')
            .action((asset_id, amount, date, identification_code) => {
                const job = schedule.scheduleJob(dateToCron(new Date().setDate(date)), async () => {
                    const userAsset = await Asset.findById(asset_id);
                    if (!userAsset) {
                        serverLog('[ERROR] Error finding user');
                        return null;
                    }

                    userAsset.balance -= amount;

                    const saveResult = await userAsset.save();
                    if (!saveResult) {
                        serverLog(`[ERROR] Transaction failed. Failed to save user asset data. asset_id: ${asset_id}`);
                        error = true;
                        return null;
                    }

                    serverLog(`[INFO] Repay ${amount} amount of money. asset_id: ${asset_id}`);
                    return true;
                });

                schedule_job_list[identification_code] = job;
            });

        const result = cacheTransactionScheduleData();
        if (!result) return false;

        setFutureExpireCallback(async () => {
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

                    serverLog(`[INFO] Future execute process success. asset_id: ${transaction_schedule.asset_id}}`);
                }
            }));
        });

        setOptionExpireCallback(async () => {
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

                serverLog(`[INFO] Option execute process success. asset_id: ${transaction_schedule.asset_id}}`);
            }
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
            serverLog(`[ERROR] Error at 'transaction_schedule_manager.js:cacheTransactionScheduleData': ${err}`);
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