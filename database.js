const { MongoClient, ServerApiVersion } = require('mongodb');
const mongoose = require('mongoose');
const { mongodb_url }  = require('./config.json');
const { serverLog } = require('./server/server_logger');
const { getStockPrice, getFuturePrice, getFutureExpirationDate, getOptionPrice, getOptionStrikePriceIndex, getOptionExpirationDate } = require('./stock_system/stock_sim');
require('dotenv').config();


mongoose.connection.on('connected', () => {
    console.log('[MONGO_DB] Database connected');
});

mongoose.connection.on('disconnected', () => {
    console.log('[MONGO_DB] Database disconnected');
});

mongoose.connection.on('reconnected', () => {
    console.log('[MONGO_DB] Database reconnected');
});

mongoose.connection.on('reconnectFailed', () => {
    console.log('[MONGO_DB] Database reconnectFailed');
});


const SHORT_SELL_MARGIN_RATE = 1.4;
const OPTION_BUY_MARGIN_RATE = 1;
const OPTION_SELL_MARGIN_RATE = 1.5;
const OPTION_UNIT_QUANTITY = 100;


const User = require('./schemas/user');
const Profile = require('./schemas/profile');
const Asset = require('./schemas/asset');
const State = require('./schemas/state');
const Ban = require('./schemas/ban');

const TransactionSchedule = require('./schemas/transaction_schedule');

const Notice = require('./schemas/notice');

const fs = require('fs');
const { getLoanInterestRate } = require('./stock_system/bank_manager');

let serversideLockedAccounts = [];

function saveServersideLockData() {
    fs.writeFile('serverside_locked_accounts.txt', serversideLockedAccounts.join('\n'), 'utf-8', (err) => {
        if (err) {
            serverLog(`[ERROR] Error while writing 'serverside_locked_accounts.txt': ${err}`);
        }
    });
}

function serversideLockAccount(id) {
    if (!serversideLockedAccounts.includes(id)) {
        serversideLockedAccounts.push(id);
        saveServersideLockData();
    }
}

function serversideUnlockAccount(id) {
    if (serversideLockedAccounts.includes(id)) {
        serversideLockedAccounts.splice(serversideLockedAccounts.indexOf(id), 1);
        saveServersideLockData();
    }
}

function isServersideLocked(id) {
    return serversideLockedAccounts.includes(id);
}


module.exports = {
    loadServersideLockData() {
        fs.access('serverside_locked_accounts.txt', fs.constants.F_OK, (err) => {
            if (err) return false;

            fs.readFile('serverside_locked_accounts.txt', 'utf-8', (err, data) => {
                if (err) {
                    serverLog(`[ERROR] Error while reading 'serverside_locked_accounts.txt': ${err}`);
                    return false;
                }
        
                serversideLockedAccounts = data.split('\n');
            });
        });
        return true;
    },

    async connectDatabase() {
        if (process.env.NODE_ENV !== 'production') {
            mongoose.set('debug', true);
        }
        
        try {
            await mongoose.connect(mongodb_url, { });
        } catch (err) {
            console.log(`[ERROR] Database connect failed.`);
            return false;
        }
        return true;
    },

    async checkUserExists(id) {
        try{
            const user = await User.exists({ userID: id });
            if (user) {
                return true;
            }
            return false;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:checkUserExists': ${err}`);
            return null;
        }
    },
    
    async createUser(id) {
        try {
            const newUser = await User.create({
                userID: id,
            });

            if (!newUser) {
                serverLog(`[ERROR] Create user failed. Failed to create user data. id: ${id}`);
                return false;
            }

            const newProfile = await Profile.create({
                user: newUser._id,
                level: {
                    level: 0,
                    state: 0,
                },
                achievements: [],
            });

            if (!newProfile) {
                serverLog(`[ERROR] Create user failed. Failed to create profile data. id: ${id}`);
            }

            const newAsset = await Asset.create({
                user: newUser._id,
                balance: 0,
                stocks: [],
                stockShortSales: [],
                futures: [],
                options: [],
                binary_options: [],
                fixed_deposits: [],
                savings_accounts: [],
                loans: [],
            });

            if (!newAsset) {
                serverLog(`[ERROR] Create user failed. Failed to create asset data. id: ${id}`);
            }

            const today = new Date();
            const initDate = new Date();
            initDate.setDate(today.getDate() - 1);

            const newState = await State.create({
                user: newUser._id,
                subsidy_recieve_date: initDate,
            });

            if (!newState) {
                serverLog(`[ERROR] Create user failed. Failed to create state data. id: ${id}`);
            }

            newUser.profile = newProfile._id;
            newUser.asset = newAsset._id;
            newUser.state = newState._id;

            const saveResult = await newUser.save();
            if (!saveResult) {
                serverLog('[ERROR] Create user failed. User data save failed.');
                return false;
            }

            serverLog(`[INFO] account created. userID: ${id}.`);
    
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:createUser': ${err}`);
            return false;
        }
    },

    async deleteUser(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }
            const result1 = await Profile.deleteOne({ _id: user.profile });
            const result2 = await Asset.deleteOne({ _id: user.asset });
            const result3 = await State.deleteOne({ _id: user.state });
            const result4 = await user.deleteOne();
            if (result1.deletedCount === 0) {
                serverLog(`[ERROR] delete user profile data failed. matching id not found.`)
                return false;
            }
            if (result2.deletedCount === 0) {
                serverLog(`[ERROR] delete user asset data failed. matching id not found.`)
                return false;
            }
            if (result3.deletedCount === 0) {
                serverLog(`[ERROR] delete user state data failed. matching id not found.`)
                return false;
            }
            if (result4.deletedCount === 0) {
                serverLog(`[ERROR] delete user data failed. matching id not found.`)
                return false;
            }
            serverLog(`[INFO] account deleted. userID: ${id}.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:deleteUser': ${err}`);
            return false;
        }
    },

    async banUser(id, details) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }

            const deleteResult = await module.exports.deleteUser(id);
            if (!deleteResult) {
                serverLog(`[ERROR] Error deleting user. id: ${id}`);
                return false;
            }

            const exists = await Ban.exists({ userID: id });
            if (exists) return null;

            const banResult = await Ban.create({
                userID: id,
                details: details,
            });

            if (!banResult) {
                serverLog('[ERROR] Add ban list failed.');
                return false;
            }

            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:banUser': ${err}`);
            return false;
        }
    },

    async checkUserBanned(id) {
        try {
            const ban = await Ban.findOne({ userID: id });
            if (ban === null) {
                return false;
            }
            return ban;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:isBanned': ${err}`);
            return null;
        }
    },

    async getUser(id) {
        try {
            const result = await User.findOne({ userID: id });
            if (result === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }
            return result;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUser': ${err}`);
            return false;
        }
    },

    async getUserProfile(id) {
        try {
            const result = await User.findOne({ userID: id }).populate('profile');
            if (result === null) {
                serverLog('[ERROR] Error finding user profile');
                return false;
            }
            return result;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserAsset': ${err}`);
            return false;
        }
    },

    async getUserAsset(id) {
        try {
            const result = await User.findOne({ userID: id }).populate('asset');
            if (result === null) {
                serverLog('[ERROR] Error finding user asset');
                return false;
            }
            return result;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserAsset': ${err}`);
            return false;
        }
    },

    async getUserState(id) {
        try {
            const result = await User.findOne({ userID: id }).populate('state');
            if (result === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }
            return result;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserAsset': ${err}`);
            return false;
        }
    },

    async transfer(from, to, amount) {
        try {
            if (isServersideLocked(from)) {
                return 'locked:from';
            }
            if (isServersideLocked(to)) {
                return 'locked:to';
            }

            const userFrom = await User.findOne({ userID: from });
            const userTo = await User.findOne({ userID: to });
            if (userFrom === null) {
                serverLog('[ERROR] Error finding from user');
                return null;
            }
            if (userTo === null) {
                serverLog('[ERROR] Error finding to user');
                return null;
            }
            
            const userFromAsset = await Asset.findById(userFrom.asset);
            const userToAsset = await Asset.findById(userTo.asset);

            if (userFromAsset.balance < amount) {
                serverLog(`[INFO] Money transfer failed. Not enough balance. id: ${from}`);
                return false;
            }

            userFromAsset.balance -= amount;
            userFromAsset.balance = Math.round(userFromAsset.balance);
            const saveFromResult = await userFromAsset.save();

            if (!saveFromResult) {
                serverLog(`[ERROR] Money transfer failed. Failed to save fromUser: ${from}.`);
                return null;
            }

            userToAsset.balance += amount;
            userToAsset.balance = Math.round(userToAsset.balance);
            const saveToResult = await userToAsset.save();

            if (!saveToResult) {
                serverLog(`[ERROR] Money transfer failed. Failed to save toUser: ${to}. Canceling transaction.`);

                userFromAsset.balance += amount;
                userFromAsset.balance = Math.round(userFromAsset.balance);
                const rollbackFromUserResult = await userFromAsset.save();

                if (!rollbackFromUserResult) {
                    serverLog(`[ERROR] Transaction cancel failed. Failed to save fromUser: ${from}. Locking account ${from} on server-side.`);
                    const lockAccountID = from;
                    serversideLockAccount(lockAccountID);
                    return null;
                }
                serverLog(`[INFO] Transaction cancel success. id: ${id}`);
                return null;
            }

            serverLog(`[INFO] Transfered ${amount}원 from ${from} to ${to}.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:transfer': ${err}`);
            return null;
        }
    },

    async addBalance(id, amount) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            if ((userAsset.balance + amount) < 0) return false;

            userAsset.balance += amount;
            userAsset.balance = Math.round(userAsset.balance);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Add balance failed. Failed to save user asset data. id: ${id}`);
                return null;
            }

            serverLog(`[INFO] Added ${amount} amount of balance to ${id}.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addBalance': ${err}`);
            return null;
        }
    },

    async setBalance(id, balance) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            if (balance < 0) return false;

            userAsset.balance = balance;
            userAsset.balance = Math.round(userAsset.balance);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Set balance failed. Failed to save user asset data. id: ${id}`);
                return null;
            }

            serverLog(`[INFO] Set balance of ${id} to ${balance}.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:setBalance': ${err}`);
            return null;
        }
    },

    async resetAsset(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }

            const deleteResult = await Asset.deleteOne(user.asset);
            if (deleteResult.deletedCount === 0) {
                serverLog('[ERROR] Error finding user');
                return false;
            }

            const newAsset = await Asset.create({
                user: user._id,
                balance: 0,
                stocks: [],
                stockShortSales: [],
                futures: [],
                options: [],
                binary_options: [],
                fixed_deposits: [],
                savings_accounts: [],
                loans: [],
            });

            user.asset = newAsset._id;

            const saveResult = await user.save();
            if (!saveResult) {
                serverLog(`[ERROR] Reset balance failed. Failed to save user asset data. id: ${id}`);
                return false;
            }
            serverLog(`[INFO] Reset balance of ${id}.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:resetAsset': ${err}`);
            return false;
        }
    },

    async markSubsidyReceived(id, date) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }

            const userState = await State.findById(user.state);
            if (userState === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }

            userState.subsidy_recieve_date = date;

            const saveResult = await userState.save();
            if (!saveResult) {
                serverLog(`[ERROR] Set subsidy date failed. Failed to save user asset data. id: ${id}`);
                return false;
            }
            serverLog(`[INFO] Reset balance of ${id}.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:markSubsidyReceived': ${err}`);
            return false;
        }
    },

    async checkSubsidyReceived(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }

            const userState = await State.findById(user.state);
            if (userState === null) {
                serverLog('[ERROR] Error finding user state');
                return null;
            }

            const receiveDate = userState.subsidy_recieve_date;
            const localDate = new Date(receiveDate.toLocaleString());
            const today = new Date();

            localDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);

            if (localDate < today) return false;
            else return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:checkSubsidyReceived': ${err}`);
            return null;
        }
    },

    async stockBuy(id, ticker, quantity) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const currentPrice = getStockPrice(ticker);
            const transactionAmount = currentPrice * quantity;
            
            if (userAsset.balance < transactionAmount) {
                serverLog(`[INFO] Buy stock failed. Not enough balance. id: ${id}`);
                return false;
            }
            
            userAsset.balance -= transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);
            
            const purchaseDate = new Date();
            
            userAsset.stocks.push({
                ticker: ticker,
                quantity: quantity,
                purchasePrice: currentPrice,
                purchaseDate: purchaseDate,
            });

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                return null;
            }

            serverLog(`[INFO] Buy ${quantity}shares of '${ticker}' stock success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockBuy': ${err}`);
            return null;
        }
    },

    async stockSell(id, ticker, quantity) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const currentPrice = getStockPrice(ticker);
            
            const transactionAmount = currentPrice * quantity;

            let quantityLeft = quantity;

            for (let i = 0; i < userAsset.stocks.length; i++) {
                const stock = userAsset.stocks[i];
                if (stock.ticker === ticker) {
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

            if (quantityLeft !== 0) return false;

            userAsset.balance += transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                return null;
            }

            serverLog(`[INFO] Sell ${quantity}shares of '${ticker}' stock success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockSell': ${err}`);
            return null;
        }
    },

    async stockShortSell(id, ticker, quantity) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const currentPrice = getStockPrice(ticker);
            const transactionAmount = currentPrice * quantity;
            const margin = currentPrice * quantity * SHORT_SELL_MARGIN_RATE;

            let currentHoldingMargin = 0;
            userAsset.stockShortSales.forEach((short) => {
                currentHoldingMargin += short.margin;
            });
            
            if (userAsset.balance < currentHoldingMargin + margin) {
                serverLog(`[INFO] Short sell stock failed. Not enough balance. id: ${id}`);
                return false;
            }

            userAsset.balance += transactionAmount;
            userAsset.balance -= margin;
            userAsset.balance = Math.round(userAsset.balance);

            const sellDate = new Date();
            const buyBackDate = new Date();
            buyBackDate.setDate(sellDate.getDate() + 5);

            userAsset.stockShortSales.push({
                ticker: ticker,
                quantity: quantity,
                sellPrice: currentPrice,
                sellDate: sellDate,
                buyBackDate: buyBackDate,
                margin: margin,
            });

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                return null;
            }

            const result = await module.exports.setTransactionSchedule(`${id}-${ticker}_short_${userAsset.stockShortSales.length - 1}`, id, `buyback stock ${userAsset._id} ${ticker} ${quantity} at ${buyBackDate.getTime()}`)
            if (!result) return null;

            serverLog(`[INFO] Short sell ${quantity}shares of '${ticker}' stock success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockShortSell': ${err}`);
            return null;
        }
    },

    async stockShortRepay(id, positionNum) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            if (userAsset.stockShortSales.length < positionNum) {
                return 'invalid_position';
            }
            
            const ticker = userAsset.stockShortSales[positionNum - 1].ticker;
            const quantity = userAsset.stockShortSales[positionNum - 1].quantity;
            
            let quantityLeft = quantity;
            for (let i = 0; i < userAsset.stocks.length; i++) {
                const stock = userAsset.stocks[i];
                if (stock.ticker === ticker) {
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

            if (quantityLeft !== 0) return false;

            userAsset.balance += userAsset.stockShortSales[positionNum - 1].margin;
            userAsset.stockShortSales.splice(positionNum - 1, 1);
            
            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                return null;
            }

            const result = await module.exports.deleteTransactionSchedule(`${id}-${ticker}_short_${positionNum - 1}`);
            if (!result) return null;

            serverLog(`[INFO] Repay ${quantity}shares of '${ticker}' stock success. id: ${id}`);

            return {
                ticker: ticker,
                quantity: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockShortRepay': ${err}`);
            return null;
        }
    },

    async futureLong(id, ticker, quantity, leverage) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const currentPrice = getFuturePrice(ticker);

            const margin = currentPrice * quantity;

            let currentHoldingMargin = 0;
            userAsset.futures.forEach((future) => {
                currentHoldingMargin += future.margin;
            });

            if (userAsset.balance < currentHoldingMargin + margin) {
                serverLog(`[INFO] Buy future failed. Not enough balance. id: ${id}`);
                return false;
            }

            const expirationDate = getFutureExpirationDate();
            const purchaseDate = new Date();
            
            userAsset.futures.push({
                ticker: ticker,
                quantity: quantity,
                leverage: leverage,
                expirationDate: expirationDate,
                purchasePrice: currentPrice,
                purchaseDate: purchaseDate,
                margin: margin,
            });
            
            userAsset.balance -= margin;
            userAsset.balance = Math.round(userAsset.balance);

            let totalQuantity = 0;
            let totalLevQuantity = 0;
            let totalMargin = 0;
            let totalInitPositionValue = 0;

            userAsset.futures.forEach((future) => {
                if (future.ticker === ticker) {
                    totalQuantity += future.quantity;
                    totalLevQuantity += future.quantity * future.leverage;
                    totalMargin += future.purchasePrice * future.quantity;
                    totalInitPositionValue += future.purchaseDate * future.quantity * future.leverage;
                }
            });
            
            // let marginCallPrice;
            // if (totalLevQuantity > 0) {
            //     marginCallPrice = (totalInitPositionValue - totalMargin) / totalLevQuantity;
            // } else if (totalLevQuantity < 0) {
            //     marginCallPrice = (totalInitPositionValue + totalMargin) / totalLevQuantity;
            // }

            // if (totalLevQuantity > 0) {
            //     module.exports.setTransactionSchedule(`${id}-future_mc-${userAsset.futures.length - 1}`, id, `marginCall future ${userAsset._id} condition ${ticker} low ${marginCallPrice}`);
            // } else if (totalLevQuantity < 0) {
            //     module.exports.setTransactionSchedule(`${id}-future_mc-${userAsset.futures.length - 1}`, id, `marginCall future ${userAsset._id} condition ${ticker} high ${marginCallPrice}`);
            // } else {
            //     module.exports.deleteTransactionSchedule(`${id}-future_mc-${userAsset.futures.length - 1}`);
            // }

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            if (userAsset.futures.length !== 0) {
                const result = await module.exports.setTransactionSchedule(`${id}_future`, id, `execute_future ${userAsset._id}`);
                if (!result) return null;
            } else {
                const result = await module.exports.deleteTransactionSchedule(`${id}_future`);
                if (!result) return null;
            }
            
            serverLog(`[INFO] Buy ${quantity}contracts of '${ticker}' future success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:futureLong': ${err}`);
            return null;
        }
    },

    async futureShort(id, ticker, quantity, leverage) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const currentPrice = getStockPrice(ticker);

            const margin = currentPrice * quantity;

            let currentHoldingMargin = 0;
            userAsset.futures.forEach((future) => {
                currentHoldingMargin += future.margin;
            });

            if (userAsset.balance < currentHoldingMargin + margin) {
                serverLog(`[INFO] Buy future failed. Not enough balance. id: ${id}`);
                return false;
            }

            const expirationDate = getFutureExpirationDate();
            const purchaseDate = new Date();
            
            userAsset.futures.push({
                ticker: ticker,
                quantity: -quantity,
                leverage: leverage,
                expirationDate: expirationDate,
                purchasePrice: currentPrice,
                purchaseDate: purchaseDate,
                margin: margin,
            });
            
            userAsset.balance -= margin;
            userAsset.balance = Math.round(userAsset.balance);

            let totalQuantity = 0;
            let totalLevQuantity = 0;
            let totalMargin = 0;
            let totalInitPositionValue = 0;

            userAsset.futures.forEach((future) => {
                if (future.ticker === ticker) {
                    totalQuantity += future.quantity;
                    totalLevQuantity += future.quantity * future.leverage;
                    totalMargin += future.purchasePrice * future.quantity;
                    totalInitPositionValue += future.purchaseDate * future.quantity * future.leverage;
                }
            });
            
            // let marginCallPrice;
            // if (totalLevQuantity > 0) {
            //     marginCallPrice = (totalInitPositionValue - totalMargin) / totalLevQuantity;
            // } else if (totalLevQuantity < 0) {
            //     marginCallPrice = (totalInitPositionValue + totalMargin) / totalLevQuantity;
            // }

            // if (totalLevQuantity > 0) {
            //     module.exports.setTransactionSchedule(`${id}-future_mc-${userAsset.futures.length - 1}`, id, `marginCall future ${userAsset._id} condition ${ticker} low ${marginCallPrice}`);
            // } else if (totalLevQuantity < 0) {
            //     module.exports.setTransactionSchedule(`${id}-future_mc-${userAsset.futures.length - 1}`, id, `marginCall future ${userAsset._id} condition ${ticker} high ${marginCallPrice}`);
            // } else {
            //     module.exports.deleteTransactionSchedule(`${id}-future_mc-${userAsset.futures.length - 1}`);
            // }
            
            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            const result = await module.exports.setTransactionSchedule(`${id}_future`, id, `execute_future ${userAsset._id}`);
            if (!result) return null;

            serverLog(`[INFO] Sell ${quantity}contracts of '${ticker}' future success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:futureShort': ${err}`);
            return null;
        }
    },

    async futureLiquidate(id, positionNum) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            if (userAsset.futures.length < positionNum) {
                return 'invalid_position';
            }

            const position = userAsset.futures[positionNum - 1];
            const ticker = position.ticker;
            const quantity = position.quantity;
            const leverage = position.leverage;
            const currentPrice = getFuturePrice(ticker);
            const initValue = position.purchasePrice * quantity * leverage;
            const currentValue = currentPrice * quantity * leverage;
            const margin = position.margin;

            const transactionAmount = (currentValue - initValue) + margin;
            userAsset.balance += transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);

            userAsset.futures.splice(positionNum - 1, 1);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            if (userAsset.futures.length === 0) {
                const result = await module.exports.deleteTransactionSchedule(`${id}_future`);
                if (!result) return null;
            }
            
            serverLog(`[INFO] Liquidated ${quantity}contracts of '${ticker}' future success. id: ${id}`);
            return position;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:futureLiquidate': ${err}`);
            return null;
        }
    },

    async callOptionBuy(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const optionPrices = getOptionPrice(ticker);
            const callOptionPrice = optionPrices.call;
            const strikePriceIndex = getOptionStrikePriceIndex(ticker, strikePrice);
            if (strikePriceIndex === null) return 'invalid_strikePrice';
            const currentPrice = callOptionPrice[strikePriceIndex];

            const transactionAmount = currentPrice * quantity * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) return false;
            
            const expirationDate = getOptionExpirationDate();
            const purchaseDate = new Date();

            userAsset.options.push({
                ticker: ticker,
                optionType: 'call',
                quantity: quantity,
                strikePrice: strikePrice,
                expirationDate: expirationDate,
                purchasePrice: currentPrice,
                purchaseDate: purchaseDate,
            });

            userAsset.balance -= transactionAmount;

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${userAsset._id}`);
            if (!result) return null;

            serverLog(`[INFO] Buy ${quantity}contracts of '${ticker}' call option success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:callOptionBuy': ${err}`);
            return null;
        }
    },

    async callOptionSell(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const optionPrices = getOptionPrice(ticker);
            const callOptionPrice = optionPrices.call;
            const strikePriceIndex = getOptionStrikePriceIndex(ticker, strikePrice);
            if (strikePriceIndex === null) return 'invalid_strikePrice';
            const currentPrice = callOptionPrice[strikePriceIndex];

            const transactionAmount = currentPrice * Math.abs(quantity) * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) return false;
            
            const expirationDate = getOptionExpirationDate();
            const purchaseDate = new Date();

            userAsset.options.push({
                ticker: ticker,
                optionType: 'call',
                quantity: quantity,
                strikePrice: strikePrice,
                expirationDate: expirationDate,
                purchasePrice: currentPrice,
                purchaseDate: purchaseDate,
            });

            userAsset.balance += transactionAmount;

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${userAsset._id}`);
            if (!result) return null;

            serverLog(`[INFO] Sell ${quantity}contracts of '${ticker}' call option success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:callOptionSell': ${err}`);
            return null;
        }
    },

    async putOptionBuy(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const optionPrices = getOptionPrice(ticker);
            const putOptionPrice = optionPrices.put;
            const strikePriceIndex = getOptionStrikePriceIndex(ticker, strikePrice);
            if (strikePriceIndex === null) return 'invalid_strikePrice';
            const currentPrice = putOptionPrice[strikePriceIndex];

            const transactionAmount = currentPrice * quantity * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) return false;
            
            const expirationDate = getOptionExpirationDate();
            const purchaseDate = new Date();

            userAsset.options.push({
                ticker: ticker,
                optionType: 'put',
                quantity: quantity,
                strikePrice: strikePrice,
                expirationDate: expirationDate,
                purchasePrice: currentPrice,
                purchaseDate: purchaseDate,
            });

            userAsset.balance -= transactionAmount;

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${userAsset._id}`);
            if (!result) return null;

            serverLog(`[INFO] Buy ${quantity}contracts of '${ticker}' put option success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:putOptionBuy': ${err}`);
            return null;
        }
    },

    async putOptionSell(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            const optionPrices = getOptionPrice(ticker);
            const putOptionPrice = optionPrices.put;
            const strikePriceIndex = getOptionStrikePriceIndex(ticker, strikePrice);
            if (strikePriceIndex === null) return 'invalid_strikePrice';
            const currentPrice = putOptionPrice[strikePriceIndex];

            const transactionAmount = currentPrice * Math.abs(quantity) * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) return false;
            
            const expirationDate = getOptionExpirationDate();
            const purchaseDate = new Date();

            userAsset.options.push({
                ticker: ticker,
                optionType: 'put',
                quantity: quantity,
                strikePrice: strikePrice,
                expirationDate: expirationDate,
                purchasePrice: currentPrice,
                purchaseDate: purchaseDate,
            });

            userAsset.balance += transactionAmount;

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${userAsset._id}`);
            if (!result) return null;

            serverLog(`[INFO] Sell ${quantity}contracts of '${ticker}' put option success. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:putOptionSell': ${err}`);
            return null;
        }
    },

    async optionLiquidate(id, positionNum) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            if (userAsset.options.length < positionNum) {
                return 'invalid_position';
            }

            const position = userAsset.options[positionNum - 1];
            const ticker = position.ticker;
            const optionType = position.optionType;
            const quantity = position.quantity;
            const currentPrice = getOptionPrice(ticker);
            const currentValue = currentPrice * quantity * OPTION_UNIT_QUANTITY;

            const transactionAmount = currentValue;

            userAsset.balance += transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);

            userAsset.options.splice(positionNum - 1, 1);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            if (userAsset.options.length === 0) {
                const result = await module.exports.deleteTransactionSchedule(`${id}_option`);
                if (!result) return null;
            }
            
            serverLog(`[INFO] Liquidated ${quantity}contracts of '${ticker}' ${optionType} option success. id: ${id}`);
            return position;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:optionLiquidate': ${err}`);
            return null;
        }
    },

    async binaryOption(id, ticker, prediction, time, amount) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            if (userAsset.balance < amount) return false;

            const now  = new Date();
            const expirationDate = new Date();
            expirationDate.setHours(now.getHours() + time);

            const currentPrice = getStockPrice(ticker);

            userAsset.binary_options.push({
                ticker: ticker,
                optionType: prediction,
                amount: amount,
                strikePrice: currentPrice,
                expirationDate: expirationDate,
                purchaseDate: now,
            });

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            const result = await module.exports.setTransactionSchedule(`${id}_binary_option`, id, `execute_binary_option ${userAsset._id} ${ticker} ${prediction} ${expirationDate.getTime()} ${amount} ${currentPrice}`);
            if (!result) return null;
            
            serverLog(`[INFO] Binary option. ticker: ${ticker}, prediction: ${prediction}, time: ${time}, amount: ${amount}. id: ${id}`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:binaryOption': ${err}`);
            return null;
        }
    },

    async loan(id, amount, dueDate, interestType) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return false;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return false;
            }

            let interestRate;
            if (interestType === '고정금리') {
                interestRate = getLoanInterestRate();
            } else if (interestType === '변동금리') {
                interestRate = 0;
            } else {
                serverLog(`[ERROR] Unsupported interest type: ${interestType}`);
                return false;
            }

            const now = new Date();

            userAsset.balance += amount;

            userAsset.loans.push({
                amount: amount,
                interestRate: interestRate,
                loanDate: now,
                dueDate: dueDate,
            });

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return false;
            }

            const result = await module.exports.setTransactionSchedule(`${id}-loan_${userAsset.loans.length - 1}`, id, `repay money ${userAsset._id} ${amount} at ${dueDate.getTime()}`);
            if (!result) return false;

            serverLog(`[INFO] Loaned ${amount} amount of money.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:loan': ${err}`);
            return false;
        }
    },

    async loanRepay(id, loanNumber) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return null;
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return null;
            }

            if (userAsset.loans.length < loanNumber) return 'invalid_loan_number';

            const loan = userAsset.loans[loanNumber - 1];
            
            let interest;

            if (loan.interestRate === 0) {
                interest = getLoanInterestRate();
            } else {
                interest = loan.interestRate;
            }

            const amount = loan.amount;

            const transactionAmount = amount * (1 + interest);

            if (userAsset.balance < transactionAmount) {
                return transactionAmount;
            }

            userAsset.balance -= transactionAmount;

            userAsset.loans.splice(loanNumber - 1, 1);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return null;
            }

            const result = await module.exports.deleteTransactionSchedule(`${id}-loan_${loanNumber - 1}`);
            if (!result) return null;

            serverLog(`[INFO] Repayed ${amount} amount of loaned money.`);
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:loanRepay': ${err}`);
            return null;
        }
    },

    async setTransactionSchedule(identification_code, subject, command) {
        try {
            const findResult = await TransactionSchedule.findOne({ identification_code: identification_code });

            if (findResult) {
                findResult.subject = subject;
                findResult.command = command;

                const saveResult = await findResult.save();

                if (!saveResult) {
                    serverLog(`[ERROR] Failed to save transaction schedule.`);
                    return false;
                }

                serverLog(`[INFO] Add transaction schedule success. identification_code: ${identification_code}, subject: ${subject}, command: ${command}`);
                return true;
            } else {
                const createResult = await TransactionSchedule.create({
                    identification_code: identification_code,
                    subject: subject,
                    command: command,
                });
        
                if (!createResult) {
                    serverLog(`[ERROR] Failed to add transaction schedule.`);
                    return false;
                }

                serverLog(`[INFO] Add transaction schedule success. identification_code: ${identification_code}, subject: ${subject}, command: ${command}`);
                return true;
            }
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addTransactionSchedule': ${err}`);
            return false;
        }
    },

    async deleteTransactionSchedule(identification_code) {
        try {
            const result = await TransactionSchedule.deleteOne({ identification_code: identification_code });
            if (result.deletedCount === 0) {
                serverLog(`[ERROR] Cannot delete transaction schedule. Matching transaction schedule not found.`);
                return false;
            }
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:deleteTransactionSchedule': ${err}`);
            return false;
        }
    },

    async getTransactionScheduleData() {
        try {
            const data = await TransactionSchedule.find();
            
            if (data.length === 0) {
                return null;
            }
            return data;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getTransactionScheduleData': ${err}`);
            return false;
        }
    },

    async getNoticeList(count) {
        try {
            const notices = await Notice.find()
                .sort({ date: -1 })
                .limit(count);
            
            if (notices.length === 0) return null;
            return notices;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getNoticeList': ${err}`);
            return null;
        }
    },

    async postNotics(title, content) {
        try {
            const result = await Notice.create({
                title: title,
                content: content,
                date: moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm'),
            });

            if (!result) {
                serverLog(`[ERROR] Post notice failed.`);
                return false;
            }
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:postNotics': ${err}`);
            return false;
        }
    },
    
    async increaseLevelPoint(id) {
        const DEFAULT_POINT_REQUIRED = 100;
        const LEVEL_UP_POINT_GAP = 20;

        try {
            const user = await User.findOne({ userID: id });
            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog(`[ERROR] Error finding user profile`);
                return null;
            }

            userProfile.level.state += 1;
            if (userProfile.level.state >= (DEFAULT_POINT_REQUIRED + (LEVEL_UP_POINT_GAP * userProfile.level.level))) {
                userProfile.level.state = 0;
                userProfile.level.level += 1;
            }

            const saveResult = userProfile.save();
            if (!saveResult) {
                serverLog(`[ERROR] Error saving user profile`);
                return false;
            }
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:increaseLevelPoint': ${err}`);
            return false;
        }
    },

    async getLevelInfo(id) {
        const DEFAULT_POINT_REQUIRED = 100;
        const LEVEL_UP_POINT_GAP = 20;

        try {
            const user = await User.findOne({ userID: id });
            if (user === null) return null;

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) return null;

            return {
                level: userProfile.level.level,
                state: userProfile.level.state,
                target: (DEFAULT_POINT_REQUIRED + (LEVEL_UP_POINT_GAP * userProfile.level.level)),
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getLevelInfo': ${err}`);
            return null;
        }
    },

    async addAchievements(id, name, description) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) return false;

            const userProfile = await User.findById(user.profile);
            if (userProfile === null) return false;

            if (!name) return false;
            if (!description) return false;

            userProfile.achievements.push({
                name: name,
                description: description,
            });

            const saveResult = userProfile.save();
            if (!saveResult) {
                serverLog(`[ERROR] Error saving user profile`);
                return false;
            }
            return true;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addAchievements': ${err}`);
            return false;
        }
    },
    
    async getAchievements(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) return null;

            const userProfile = await User.findById(user.profile);
            if (userProfile === null) return null;

            return userProfile.achievements;
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addAchievements': ${err}`);
            return null;
        }
    },
}

exports.OPTION_UNIT_QUANTITY = OPTION_UNIT_QUANTITY;