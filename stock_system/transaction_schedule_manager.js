const { getTransactionScheduleData, deleteTransactionSchedule } = require("../database");
const { setFutureExpireCallback, setOptionExpireCallback } = require("./stock_sim");
const { program } = require('commander');
const { serverLog } = require("../server/server_logger");


const short_buyback_list = [];
const future_settle_list = [];
const option_settle_list = [];

async function cacheTransactionScheduleData() {
    const data = await getTransactionScheduleData();

    if (data === false) {
        return false;
    } else if (data !== null) {
        data.forEach((transaction_schedule) => {
            const command_args = transaction_schedule.command.split(' ');
            
            program.command('buyback stock <asset_id> <ticker> <quantity> at <time>')
                .action((asset_id, ticker, quantity, time) => {
                    const transaction_schedule = {
                        asset_id: asset_id,
                        ticker: ticker,
                        quantity: quantity,
                        time: new Date().setTime(time),
                    };

                    short_buyback_list.push(transaction_schedule);
                });
            
            program.command('settle future <asset_id>')
                .action((asset_id) => {
                    const transaction_schedule = {
                        asset_id: asset_id,
                    };

                    future_settle_list.push(transaction_schedule);
                });
        });
        return true;
    }
    return false;
}

const Asset = require('../schemas/asset');

module.exports = {
    async initScheduleManager() {
        const result = cacheTransactionScheduleData();
        if (!result) return false;

        setFutureExpireCallback(async () => {
            const results = await Promise.all(future_settle_list.map(async (transaction_schedule) => {
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
                            serverLog(`[INFO] Buy stock failed. Not enough balance. id: ${id}`);
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
        
                        const saveResult = await userAsset.save();
                        if (!saveResult) {
                            serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                            error = true;
                            return null;
                        }
        
                        serverLog(`[INFO] Buy ${quantity}shares of '${ticker}' stock success. id: ${id}`);
                        return true;
                    } else if (future.quantity < 0) {
                        const currentPrice = getStockPrice(ticker);
                        
                        const transactionAmount = currentPrice * Math.abs(future.quantity);

                        userAsset.balance -= transactionAmount;

                        const saveResult = await userAsset.save();
                        if (!saveResult) {
                            serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                            error = true;
                            return null;
                        }

                        serverLog(`[INFO] Sell ${quantity}shares of '${ticker}' stock success. id: ${id}`);
                        return true;
                    }
                }));

                if (!error) {
                    serverLog(`[ERROR] Failed to settle future. asset_id: ${transaction_schedule.asset_id}`);
                } else {
                    userAsset.futures = [];
                }
            }));
        });

        setOptionExpireCallback(async () => {

        });

        return true;
    },

    async addTransactionScheduleData(data) {
        if (!data) return;
        transaction_schedule_list.push(data);
    },

    async deleteTransactionScheduleData(identification_code) {
        for (let i = transaction_schedule_list - 1; i >= 0; i--) {
            if (transaction_schedule_list[i].identification_code === identification_code) {
                transaction_schedule_list.splice(i, 1);
                return true;
            }
        }
        return false;
    }
}