const mongoose = require('mongoose');
const { mongodb_url }  = require('./config.json');
const { serverLog } = require('./server/server_logger');
const { getStockPrice, getFuturePrice, getFutureExpirationDate, getOptionPrice, getOptionExpirationDate } = require('./stock_system/stock_sim');
const { getLoanInterestRate, getFixedDepositInterestRate, calculateLoanLimit, getLoanInterestRatePoint, getFixedDepositInterestRatePoint } = require('./stock_system/bank_manager');
require('dotenv').config();
const moment = require('moment-timezone');
const fs = require('fs');
const { getKoreanTime }= require('./korean_time');
const { INITIAL_BALANCE, SHORT_SELL_MARGIN_RATE, OPTION_UNIT_QUANTITY } = require('./setting');


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


const User = require('./schemas/user');
const Profile = require('./schemas/profile');
const Asset = require('./schemas/asset');
const State = require('./schemas/state');
const Ban = require('./schemas/ban');
const NotificationSchedule = require('./schemas/notification_schedule');
const Fund = require('./schemas/fund');

const TransactionSchedule = require('./schemas/transaction_schedule');

const Notice = require('./schemas/notice');


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
                return {
                    state: 'success',
                    data: true,
                };
            }
            return {
                state: 'success',
                data: false,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:checkUserExists': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },
    
    async createUser(id) {
        try {
            const newUser = await User.create({
                userID: id,
            });

            if (!newUser) {
                serverLog(`[ERROR] Create user failed. Failed to create user data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const newProfile = await Profile.create({
                user: newUser._id,
                level: {
                    level: 0,
                    state: 0,
                },
                credit_rating: 100,
                achievements: [],
            });

            if (!newProfile) {
                serverLog(`[ERROR] Create user failed. Failed to create profile data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const newAsset = await Asset.create({
                user: newUser._id,
                balance: INITIAL_BALANCE,
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            const today = new Date();
            const initDate = new Date();
            initDate.setDate(today.getDate() - 1);

            const newState = await State.create({
                user: newUser._id,
                subsidy_recieve_date: initDate,
                currentAccount: '@self',
            });

            if (!newState) {
                serverLog(`[ERROR] Create user failed. Failed to create state data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const newNotificationSchedule = await NotificationSchedule.create({
                user: newUser._id,
                notifications: [],
            });

            if (!newNotificationSchedule) {
                serverLog(`[ERROR] Create user failed. Failed to create notification schedule data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            newUser.profile = newProfile._id;
            newUser.asset = newAsset._id;
            newUser.state = newState._id;
            newUser.notification_schedule = newNotificationSchedule._id;

            const saveResult = await newUser.save();
            if (!saveResult) {
                serverLog('[ERROR] Create user failed. User data save failed.');
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] account created. userID: ${id}.`);

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:createUser': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async deleteUser(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            const result1 = await Profile.deleteOne({ _id: user.profile });
            const result2 = await Asset.deleteOne({ _id: user.asset });
            const result3 = await State.deleteOne({ _id: user.state });
            const result4 = await TransactionSchedule.deleteMany(
                { subject: id },
            );
            const result5 = await NotificationSchedule.deleteOne({ _id: user.notification_schedule });
            const result6 = await user.deleteOne();
            if (result1.deletedCount === 0) {
                serverLog(`[ERROR] Delete user profile data failed. matching id not found.`)
                return {
                    state: 'error',
                    data: null,
                };
            }
            if (result2.deletedCount === 0) {
                serverLog(`[ERROR] Delete user asset data failed. matching id not found.`)
                return {
                    state: 'error',
                    data: null,
                };
            }
            if (result3.deletedCount === 0) {
                serverLog(`[ERROR] Delete user state data failed. matching id not found.`)
                return {
                    state: 'error',
                    data: null,
                };
            }
            if (result5.deletedCount === 0) {
                serverLog(`[ERROR] Delete user notification schedule data failed. matching id not found.`)
                return {
                    state: 'error',
                    data: null,
                };
            }
            if (result6.deletedCount === 0) {
                serverLog(`[ERROR] Delete user data failed. matching id not found.`)
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Account deleted. userID: ${id}.`);

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:deleteUser': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async banUser(id, details) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const deleteResult = await module.exports.deleteUser(id);
            if (deleteResult.state === 'error') {
                serverLog(`[ERROR] Error deleting user. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const exists = await Ban.exists({ userID: id });
            if (exists) {
                return {
                    state: 'success',
                    data: null,
                };
            }

            const banResult = await Ban.create({
                userID: id,
                details: details,
            });

            if (!banResult) {
                serverLog('[ERROR] Add ban list failed.');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:banUser': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async checkUserBanned(id) {
        try {
            const ban = await Ban.findOne({ userID: id });

            let isBanned;
            if (ban) isBanned = true;
            else isBanned = false;

            return {
                state: 'success',
                data: isBanned,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:checkUserBanned': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getUser(id) {
        try {
            const result = await User.findOne({ userID: id });
            if (result === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: result,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUser': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getUserProfile(id) {
        try {
            const result = await User.findOne({ userID: id }).populate('profile');
            if (result === null) {
                serverLog('[ERROR] Error finding user profile');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: result,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserAsset': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getUserAsset(id) {
        try {
            const result = await User.findOne({ userID: id }).populate('asset');
            if (result === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: result,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserAsset': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getUserState(id) {
        try {
            const result = await User.findOne({ userID: id }).populate('state');
            if (result === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: result,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserAsset': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async transfer(from, to, amount) {
        try {
            if (isServersideLocked(from)) {
                return {
                    state: 'locked:from',
                    data: null,
                };
            }
            if (isServersideLocked(to)) {
                return {
                    state: 'locked:to',
                    data: null,
                };
            }

            const userFrom = await User.findOne({ userID: from });
            const userTo = await User.findOne({ userID: to });
            if (userFrom === null) {
                serverLog('[ERROR] Error finding from user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            if (userTo === null) {
                serverLog('[ERROR] Error finding to user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userFromAsset = await Asset.findById(userFrom.asset);
            const userToAsset = await Asset.findById(userTo.asset);

            if (userFromAsset.balance < amount) {
                serverLog(`[INFO] Money transfer failed. Not enough balance. id: ${from}`);
                return {
                    state: 'no_balance',
                    data: null,
                };
            }

            userFromAsset.balance -= amount;
            userFromAsset.balance = Math.round(userFromAsset.balance);
            const saveFromResult = await userFromAsset.save();

            if (!saveFromResult) {
                serverLog(`[ERROR] Money transfer failed. Failed to save fromUser: ${from}.`);
                return {
                    state: 'error',
                    data: null,
                };
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

                    return {
                        state: 'error',
                        data: null,
                    };
                }

                serverLog(`[INFO] Transaction cancel success. id: ${id}`);

                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Transfered ${amount}원 from ${from} to ${to}.`);
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:transfer': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async addBalance(id, amount) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            userAsset.balance += amount;
            userAsset.balance = Math.round(userAsset.balance);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Add balance failed. Failed to save user asset data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Added ${amount} amount of balance to ${id}.`);
            return {
                state: 'success',
                data: userAsset.balance,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addBalance': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async setBalance(id, balance) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            userAsset.balance = balance;
            userAsset.balance = Math.round(userAsset.balance);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Set balance failed. Failed to save user asset data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Set balance of ${id} to ${balance}.`);
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:setBalance': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async resetAsset(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const deleteResult = await Asset.deleteOne(user.asset);
            if (deleteResult.deletedCount === 0) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Reset balance of ${id}.`);
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:resetAsset': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async markSubsidyReceived(id, date) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userState = await State.findById(user.state);
            if (userState === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            userState.subsidy_recieve_date = date;

            const saveResult = await userState.save();
            if (!saveResult) {
                serverLog(`[ERROR] Set subsidy date failed. Failed to save user asset data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }
            serverLog(`[INFO] Reset balance of ${id}.`);
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:markSubsidyReceived': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async checkSubsidyReceived(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userState = await State.findById(user.state);
            if (userState === null) {
                serverLog('[ERROR] Error finding user state');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const receiveDate = userState.subsidy_recieve_date;
            const localDate = getKoreanTime(receiveDate);
            const today = getKoreanTime(new Date());

            localDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);

            if (localDate.getTime() < today.getTime()) {
                return {
                    state: 'success',
                    data: false,
                };
            } else {
                return {
                    state: 'success',
                    data: true,
                };
            }
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:checkSubsidyReceived': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async stockBuy(id, ticker, quantity) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const currentPrice = getStockPrice(ticker);

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / currentPrice);
                serverLog(`[INFO] Buy stock failed. Not enough balance. id: ${id}`);
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const transactionAmount = currentPrice * quantity;
            
            if (userAsset.balance < transactionAmount) {
                serverLog(`[INFO] Buy stock failed. Not enough balance. id: ${id}`);
                return {
                    state: 'no_balance',
                    data: null,
                };
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Buy ${quantity}shares of '${ticker}' stock success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockBuy': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async stockSell(id, ticker, quantity) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const currentPrice = getStockPrice(ticker);

            if (quantity === 0) {
                for (let i = 0; i < userAsset.stocks.length; i++) {
                    const stock = userAsset.stocks[i];
                    if (stock.ticker === ticker) {
                        quantity += stock.quantity;
                        userAsset.stocks.splice(i, 1);
                    }
                }
            } else {
                
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
                
                if (quantityLeft !== 0) {
                    return {
                        state: 'no_stock',
                        data: null,
                    };
                }
            }

            const transactionAmount = currentPrice * quantity;
            
            userAsset.balance += transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Sell ${quantity}shares of '${ticker}' stock success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockSell': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async stockShortSell(id, ticker, quantity) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const currentPrice = getStockPrice(ticker);

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / (currentPrice * SHORT_SELL_MARGIN_RATE));
            }

            const transactionAmount = currentPrice * quantity;
            const margin = currentPrice * quantity * SHORT_SELL_MARGIN_RATE;

            let currentHoldingMargin = 0;
            userAsset.stockShortSales.forEach((short) => {
                currentHoldingMargin += short.margin;
            });
            
            if (userAsset.balance < currentHoldingMargin + margin) {
                serverLog(`[INFO] Short sell stock failed. Not enough balance. id: ${id}`);
                return {
                    state: 'no_balance',
                    data: null,
                };
            }

            userAsset.balance += transactionAmount;
            userAsset.balance -= margin;
            userAsset.balance = Math.round(userAsset.balance);

            const sellDate = new Date();
            const buyBackDate = new Date();
            buyBackDate.setDate(sellDate.getDate() + 5);

            let uid;
            if (userAsset.stockShortSales.length === 0) {
                uid = 0;
            } else {
                uid = userAsset.stockShortSales[userAsset.stockShortSales.length - 1].uid + 1;
            }

            userAsset.stockShortSales.push({
                ticker: ticker,
                quantity: quantity,
                sellPrice: currentPrice,
                sellDate: sellDate,
                buyBackDate: buyBackDate,
                margin: margin,
                uid: uid,
            });

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}-short_${uid}`, id, `buyback stock ${id} ${userAsset._id} ${uid} at ${buyBackDate.getTime()}`)
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Short sell ${quantity}shares of '${ticker}' stock success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockShortSell': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async stockShortRepay(id, positionNum) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.stockShortSales.length < positionNum) {
                return {
                    state: 'invalid_position',
                    data: null,
                };
            }
            
            const short = userAsset.stockShortSales[positionNum - 1];
            const ticker = short.ticker;
            const quantity = short.quantity;
            const uid = short.uid;
            
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

            if (quantityLeft !== 0) {
                return {
                    state: 'no_stock',
                    data: null,
                };
            }

            userAsset.balance += userAsset.stockShortSales[positionNum - 1].margin;
            userAsset.stockShortSales.splice(positionNum - 1, 1);
            
            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user asset data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.deleteTransactionSchedule(`${id}-short_${uid}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Repay ${quantity}shares of '${ticker}' stock success. id: ${id}`);

            return {
                state: 'success',
                data: short,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:stockShortRepay': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async futureLong(id, ticker, quantity, leverage) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const currentPrice = getFuturePrice(ticker);

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / currentPrice);
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const margin = currentPrice * quantity;

            if (userAsset.balance < margin) {
                serverLog(`[INFO] Buy future failed. Not enough balance. id: ${id}`);
                return {
                    state: 'no_balance',
                    data: null,
                };
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.futures.length !== 0) {
                const result = await module.exports.setTransactionSchedule(`${id}_future`, id, `execute_future ${id} ${userAsset._id}`);
                if (result.state === 'error') {
                    return {
                        state: 'error',
                        data: null,
                    };
                }
            } else {
                const result = await module.exports.deleteTransactionSchedule(`${id}_future`);
                if (result.state === 'error') {
                    return {
                        state: 'error',
                        data: null,
                    };
                }
            }
            
            serverLog(`[INFO] Buy ${quantity}contracts of '${ticker}' future success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:futureLong': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async futureShort(id, ticker, quantity, leverage) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const currentPrice = getStockPrice(ticker);

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / currentPrice);
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const margin = currentPrice * quantity;

            if (userAsset.balance < margin) {
                serverLog(`[INFO] Buy future failed. Not enough balance. id: ${id}`);
                return {
                    state: 'no_balance',
                    data: null,
                };
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}_future`, id, `execute_future ${id} ${userAsset._id}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Sell ${quantity}contracts of '${ticker}' future success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:futureShort': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async futureLiquidate(id, positionNum) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.futures.length < positionNum) {
                return {
                    state: 'invalid_position',
                    data: null,
                };
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.futures.length === 0) {
                const result = await module.exports.deleteTransactionSchedule(`${id}_future`);
                if (result.state === 'error') {
                    return {
                        state: 'error',
                        data: null,
                    };
                }
            }
            
            serverLog(`[INFO] Liquidated ${quantity}contracts of '${ticker}' future success. id: ${id}`);
            return {
                state: 'success',
                data: position,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:futureLiquidate': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async callOptionBuy(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const optionPrices = getOptionPrice(ticker);
            const callOptionPrice = optionPrices.call;
            const currentPrice = callOptionPrice[strikePrice.toString()];
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const transactionAmount = currentPrice * quantity * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
            }
            
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${id} ${userAsset._id}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Buy ${quantity}contracts of '${ticker}' call option success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:callOptionBuy': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async callOptionSell(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const optionPrices = getOptionPrice(ticker);
            const callOptionPrice = optionPrices.call;
            const currentPrice = callOptionPrice[strikePrice.toString()];
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const transactionAmount = currentPrice * Math.abs(quantity) * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
            }
            
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${id} ${userAsset._id}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Sell ${quantity}contracts of '${ticker}' call option success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:callOptionSell': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async putOptionBuy(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const optionPrices = getOptionPrice(ticker);
            const putOptionPrice = optionPrices.put;
            const currentPrice = putOptionPrice[strikePrice.toString()];
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const transactionAmount = currentPrice * quantity * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
            }
            
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${id} ${userAsset._id}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Buy ${quantity}contracts of '${ticker}' put option success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:putOptionBuy': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async putOptionSell(id, ticker, quantity, strikePrice) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const optionPrices = getOptionPrice(ticker);
            const putOptionPrice = optionPrices.put;
            const currentPrice = putOptionPrice[strikePrice.toString()];
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity === 0) {
                quantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const transactionAmount = currentPrice * Math.abs(quantity) * OPTION_UNIT_QUANTITY;

            if (userAsset.balance < transactionAmount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
            }
            
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
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}_option`, id, `execute_option ${id} ${userAsset._id}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Sell ${quantity}contracts of '${ticker}' put option success. id: ${id}`);
            return {
                state: 'success',
                data: quantity,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:putOptionSell': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async optionLiquidate(id, positionNum) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.options.length < positionNum) {
                return {
                    state: 'invalid_position',
                    data: null,
                };
            }

            const position = userAsset.options[positionNum - 1];
            const ticker = position.ticker;
            const optionType = position.optionType;
            const quantity = position.quantity;
            const strikePrice = position.strikePrice;
            const currentOptionPrices = getOptionPrice(ticker);
            
            let currentPrice;
            if (optionType === 'call') {
                currentPrice = currentOptionPrices.call[strikePrice.toString()];
            } else if (optionType === 'put') {
                currentPrice = currentOptionPrices.put[strikePrice.toString()];
            }

            if (!currentPrice) currentPrice = 0;

            const currentValue = currentPrice * quantity * OPTION_UNIT_QUANTITY;

            const transactionAmount = currentValue;

            userAsset.balance += transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);

            userAsset.options.splice(positionNum - 1, 1);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.options.length === 0) {
                const result = await module.exports.deleteTransactionSchedule(`${id}_option`);
                if (result.state === 'error') {
                    return {
                        state: 'error',
                        data: null,
                    };
                }
            }
            
            serverLog(`[INFO] Liquidated ${quantity}contracts of '${ticker}' ${optionType} option success. id: ${id}`);
            return {
                state: 'success',
                data: position,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:optionLiquidate': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async binaryOption(id, ticker, prediction, time, amount) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.balance < amount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
            }

            if (amount === 0) {
                amount = userAsset.balance;
                if (amount === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            const now  = new Date();
            const expirationDate = new Date();
            expirationDate.setHours(now.getHours() + time);

            const currentPrice = getStockPrice(ticker);

            let uid;
            if (userAsset.binary_options.length === 0) {
                uid = 0;
            } else {
                uid = userAsset.binary_options[userAsset.binary_options.length - 1].uid + 1;
            }

            userAsset.binary_options.push({
                ticker: ticker,
                optionType: prediction,
                amount: amount,
                strikePrice: currentPrice,
                expirationDate: expirationDate,
                purchaseDate: now,
                uid: uid,
            });

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}_binary_option_${uid}`, id, `execute_binary_option ${id} ${userAsset._id} ${uid} ${expirationDate.getTime()}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            serverLog(`[INFO] Binary option. ticker: ${ticker}, prediction: ${prediction}, time: ${time}, amount: ${amount}. id: ${id}`);
            return {
                state: 'success',
                data: amount,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:binaryOption': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async loan(id, amount, dueDate, interestType, days) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const creditRating = await module.exports.getUserCredit(id);
            if (creditRating.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            const loanLimit = calculateLoanLimit(userAsset, creditRating.data, dueDate);

            console.log(`loanLimit: ${loanLimit}`);

            if (amount > loanLimit) {
                return {
                    state: 'loan_limit_over',
                    data: loanLimit,
                };
            }

            let interestRate;
            if (interestType === '고정금리') {
                interestRate = getLoanInterestRate();
            } else if (interestType === '변동금리') {
                interestRate = 0;
            } else {
                serverLog(`[ERROR] Unsupported interest type: ${interestType}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const now = new Date();

            userAsset.balance += amount;

            let uid;
            if (userAsset.loans.length === 0) {
                uid = 0;
            } else {
                uid = userAsset.loans[userAsset.loans.length - 1].uid + 1;
            }

            userAsset.loans.push({
                amount: amount,
                interestRate: interestRate,
                loanDate: now,
                dueDate: dueDate,
                days: days,
                uid: uid,
            });

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}-loan_${uid}`, id, `repay_loan ${id} ${userAsset._id} ${uid} at ${dueDate.getTime()}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Loaned ${amount} amount of money.`);
            return {
                state: 'success',
                data: getLoanInterestRatePoint(),
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:loan': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async loanRepay(id, loanNumber) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.loans.length < loanNumber) {
                return {
                    state: 'invalid_loan_number',
                    data: null,
                };
            }

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
                return {
                    state: 'no_balance',
                    data: transactionAmount,
                };
            }

            userAsset.balance -= transactionAmount;

            userAsset.loans.splice(loanNumber - 1, 1);

            const saveResult = await userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Transaction failed. Failed to save user data. id: ${id}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.deleteTransactionSchedule(`${id}-loan_${loan.uid}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            serverLog(`[INFO] Repayed ${amount} amount of loaned money.`);
            return {
                state: 'success',
                data: amount,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:loanRepay': ${err}`);
            return {
                state: 'error',
                data: null,
            };
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
                    return {
                        state: 'error',
                        data: null,
                    };
                }

                serverLog(`[INFO] Add transaction schedule success. identification_code: ${identification_code}, subject: ${subject}, command: ${command}`);
                return {
                    state: 'success',
                    data: null,
                };
            } else {
                const createResult = await TransactionSchedule.create({
                    identification_code: identification_code,
                    subject: subject,
                    command: command,
                });
        
                if (!createResult) {
                    serverLog(`[ERROR] Failed to add transaction schedule.`);
                    return {
                        state: 'error',
                        data: null,
                    };
                }

                serverLog(`[INFO] Add transaction schedule success. identification_code: ${identification_code}, subject: ${subject}, command: ${command}`);
                return {
                    state: 'success',
                    data: null,
                };
            }
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addTransactionSchedule': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async deleteTransactionSchedule(identification_code) {
        try {
            const result = await TransactionSchedule.deleteOne({ identification_code: identification_code });
            if (result.deletedCount === 0) {
                serverLog(`[ERROR] Cannot delete transaction schedule. Matching transaction schedule not found.`);
                return {
                    state: 'error',
                    data: null,
                };
            }
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:deleteTransactionSchedule': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getTransactionScheduleData() {
        try {
            const data = await TransactionSchedule.find();
            
            if (data.length === 0) {
                return {
                    state: 'success',
                    data: null,
                };
            }
            return {
                state: 'success',
                data: data,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getTransactionScheduleData': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getNoticeList(count) {
        try {
            const notices = await Notice.find()
                .sort({ date: -1 })
                .limit(count);
            
            if (notices.length === 0) {
                return {
                    state: 'success',
                    data: null,
                };
            }
            return {
                state: 'success',
                data: notices,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getNoticeList': ${err}`);
            return {
                state: 'error',
                data: null,
            };
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
                return {
                    state: 'error',
                    data: null,
                };
            }
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:postNotics': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },
    
    async increaseLevelPoint(id) {
        const DEFAULT_POINT_REQUIRED = 100;
        const LEVEL_UP_POINT_GAP = 20;

        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog(`[ERROR] Error finding user profile`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            userProfile.level.state += 1;
            if (userProfile.level.state >= (DEFAULT_POINT_REQUIRED + (LEVEL_UP_POINT_GAP * userProfile.level.level))) {
                userProfile.level.state = 0;
                userProfile.level.level += 1;
            }

            const saveResult = userProfile.save();
            if (!saveResult) {
                serverLog(`[ERROR] Error saving user profile`);
                return {
                    state: 'error',
                    data: null,
                };
            }
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:increaseLevelPoint': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getLevelInfo(id) {
        const DEFAULT_POINT_REQUIRED = 100;
        const LEVEL_UP_POINT_GAP = 20;

        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog(`[ERROR] Error finding user profile`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: {
                    level: userProfile.level.level,
                    state: userProfile.level.state,
                    target: (DEFAULT_POINT_REQUIRED + (LEVEL_UP_POINT_GAP * userProfile.level.level)),
                },
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getLevelInfo': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async addAchievements(id, name, description) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog(`[ERROR] Error finding user profile`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (!name) {
                return {
                    state: 'invalid_parameter',
                    data: null,
                };
            }
            if (!description) {
                return {
                    state: 'invalid_parameter',
                    data: null,
                };
            }

            userProfile.achievements.push({
                name: name,
                description: description,
            });

            const saveResult = userProfile.save();
            if (!saveResult) {
                serverLog(`[ERROR] Error saving user profile`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addAchievements': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },
    
    async getAchievements(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog(`[ERROR] Error finding user profile`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: userProfile.achievements,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addAchievements': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async openFixedDeposit(id, amount, product) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.balance < amount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
            }

            const interestRate = getFixedDepositInterestRate();
            const depositDate = new Date();
            const maturityDate = new Date();
            maturityDate.setDate(depositDate.getDate() + product);

            let uid;
            if (userAsset.futures.length === 0) {
                uid = 0;
            } else {
                uid = userAsset.futures[userAsset.futures.length - 1].uid + 1;
            }

            userAsset.fixed_deposits.push({
                amount: amount,
                product: product,
                interestRate: interestRate,
                depositDate: depositDate,
                maturityDate: maturityDate,
                uid: uid,
            });

            userAsset.balance -= amount;

            const result = await module.exports.setTransactionSchedule(`${id}-fixed_deposit_${uid}`, id, `pay_interest_fixed_deposit ${id} ${userAsset._id} ${uid} at ${maturityDate.getTime()}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            const saveResult = userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Error saving user asset`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: getFixedDepositInterestRatePoint(),
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:openFixedDeposit': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async openSavingsAccount(id, amount, product) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userAsset.balance < amount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
            }

            const interestRate = getFixedDepositInterestRate();
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + product);

            let uid;
            if (userAsset.futures.length === 0) {
                uid = 0;
            } else {
                uid = userAsset.futures[userAsset.futures.length - 1].uid + 1;
            }

            userAsset.savings_accounts.push({
                amount: amount,
                product: product,
                interestRate: interestRate,
                startDate: startDate,
                endDate: endDate,
                uid: uid,
            });

            userAsset.balance -= amount;

            let error = false;

            for (let i = 1; i < product; i++) {
                const date = new Date();
                const targetDate = date.setDate(startDate.getDate() + i);
                const result = await module.exports.setTransactionSchedule(`${id}-savings_account_${uid}_${i}`, id, `pay_money_savings_account ${id} ${userAsset._id} ${uid} ${i} at ${targetDate.getTime()}`);
                if (result.state === 'error') {
                    error = true;
                }
            }

            if (error) {
                return {
                    state: 'error',
                    data: null,
                };
            }

            const result = await module.exports.setTransactionSchedule(`${id}-savings_account_${uid}`, id, `pay_interest_savings_account ${id} ${userAsset._id} ${uid} at ${endDate.getTime()}`);
            if (result.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            const saveResult = userAsset.save();
            if (!saveResult) {
                serverLog(`[ERROR] Error saving user asset`);
                return {
                    state: 'error',
                    data: null,
                };
            }
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:openSavingsAccount': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async addNotification(id, command) {

    },

    async deleteNotification(id, notificationNum) {

    },

    async getNotificationList() {

    },

    async resetNotification() {

    },

    async setCreditRating(id, creditRating) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog('[ERROR] Error finding user profile');
                return {
                    state: 'error',
                    data: null,
                };
            }

            userProfile.credit_rating = creditRating;

            const saveResult = userProfile.save();
            if (!saveResult) {
                serverLog(`[ERROR] Error saving user profile`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:setCreditRating': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getCreditRating(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog('[ERROR] Error finding user profile');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: userProfile.credit_rating,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getCreditRating': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async setUsersCredit(operations) {
        try {
            const result = await Profile.bulkWrite(operations);
            if (result.acknowledged) {
                return {
                    state: 'success',
                    data: null,
                };
            }
            else {
                return {
                    state: 'error',
                    data: null,
                };
            }
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:setUsersCredit': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getUserCredit(id) {
        try {
            const userProfile = await module.exports.getUserProfile(id);
            if (userProfile.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: userProfile.data.profile.credit_rating,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserCredit': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getAllUser() {
        try {
            const data = await User.find();

            if (data.length === 0) {
                return {
                    state: 'success',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: data,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getAllUser': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getAllUserAsset() {
        try {
            const data = await User.find().populate('asset');

            if (data.length === 0) {
                return {
                    state: 'success',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: data,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getAllUserAsset': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async fundCreate(id, fundName, description, fee) {
        try {
            const asset = await Asset.create({
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

            if (!asset) {
                serverLog('[ERROR] Create fund failed. Failed to create fund asset.');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const fund = await Fund.create({
                name: fundName,
                description: description,
                fee: fee,
                administrators: [{
                    userID: id,
                    isTopAdmin: true,
                }],
                asset: asset._id,
            });

            if (!fund) {
                serverLog('[ERROR] Create fund failed. Failed to create fund data.');
                return {
                    state: 'error',
                    data: null,
                };
            }

            asset.fund = fund._id;

            const saveResult = await asset.save();
            if (!saveResult) {
                serverLog('[ERROR] Create fund failed. Failed to save fund asset data.');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:createFund': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async fundDelete(id, fundName, description) {
        try {
            const fund = await Fund.findOne({ name: fundName });

            const fundAsset = fund.asset;
            
            const fundResult = await fund.deleteOne();
            if (fundResult.deletedCount === 0) {
                serverLog(`[ERROR] Delete fund data failed. matching fund not found.`)
                return {
                    state: 'no_fund',
                    data: null,
                };
            }
            
            const assetResult = await Asset.deleteOne({ _id: fundAsset });
            if (assetResult.deletedCount === 0) {
                serverLog(`[ERROR] Delete fund asset data failed. matching fund not found.`)
                return {
                    state: 'error',
                    data: null,
                };
            }
            
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:deleteFund': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getFundInfo(fundName) {
        try {
            const fund = await Fund.findOne({ name: fundName }).populate('asset');
            if (!fund) {
                serverLog('[ERROR] Error finding fund');
                return {
                    state: 'no_fund',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: fund,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:deleteFund': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async getFundList() {
        try {
            const funds = await Fund.find().populate('asset');
            if (funds.length === 0) {
                serverLog('[ERROR] Error finding fund');
                return {
                    state: 'no_fund',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: funds,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getFundList': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async fundAddAdministrator(id, fundName, admin) {
        try {
            const fund = await Fund.findOne({ name: fundName });
            if (!fund) {
                serverLog('[ERROR] Error finding fund');
                return {
                    state: 'no_fund',
                    data: null,
                };
            }

            fund.administrators.push({
                userID: admin,
                isTopAdmin: false,
            });

            const saveResult = await fund.save();
            if (!saveResult) {
                serverLog(`[ERROR] Fund add administrator failed. Failed to save fund data. fundName: ${fundName}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:fundAddAdmin': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async fundRemoveAdministrator(id, fundName, administratorNum) {
        try {
            const fund = await Fund.findOne({ name: fundName });
            if (!fund) {
                serverLog('[ERROR] Error finding fund');
                return {
                    state: 'no_fund',
                    data: null,
                };
            }

            if (fund.administrators.length < administratorNum) {
                return {
                    state: 'invalid_admin_num',
                    data: null,
                };
            }

            const administrator = fund.administrators[administratorNum - 1];

            fund.administrators.splice(administratorNum - 1, 1);

            const saveResult = await fund.save();
            if (!saveResult) {
                serverLog(`[ERROR] Fund remove administrator failed. Failed to save fund data. fundName: ${fundName}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: administrator.userID,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:fundRemoveAdmin': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async fundGetAdministrators(fundName) {
        try {
            const fund = await Fund.findOne({ name: fundName });
            if (!fund) {
                serverLog('[ERROR] Error finding fund');
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: fund.administrators,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:fundGetAdministrators': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async fundLogin(id, fundName) {
        try {
            const fund = await Fund.findOne({ name: fundName });
            if (!fund) {
                serverLog('[ERROR] Error finding fund');
                return {
                    state: 'no_fund',
                    data: null,
                };
            }

            const isAdministrator = fund.administrators.some((administrator) => {
                return administrator.userID === id;
            });

            if (!isAdministrator) {
                serverLog(`[INFO] Failed to login to fund '${fundName}'. ${id} is not administrator.`);
                return {
                    state: 'not_admin',
                    data: null,
                };
            }

            const user = await User.findOne({ userID: id });
            if (!user) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userState = await State.findById(user.state);
            if (!userState) {
                serverLog('[ERROR] Error finding user state');
                return {
                    state: 'error',
                    data: null,
                };
            }

            userState.currentAccount = `@fund_${fundName}`;

            const saveResult = await userState.save();
            if (!saveResult) {
                serverLog(`[ERROR] Login fund administrator failed. Failed to save user state data. id: ${id}, fundName: ${fundName}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:fundLogin': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    },

    async fundLogout(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (!user) {
                serverLog('[ERROR] Error finding user');
                return {
                    state: 'error',
                    data: null,
                };
            }

            const userState = await State.findById(user.state);
            if (!userState) {
                serverLog('[ERROR] Error finding user state');
                return {
                    state: 'error',
                    data: null,
                };
            }

            if (userState.currentAccount === '@self') {
                serverLog(`[ERROR] Logout fund administrator failed. User is not loggin into any fund. id: ${id}`);
                return {
                    state: 'not_logged_in',
                    data: null,
                }
            }

            userState.currentAccount = '@self';

            const saveResult = await userState.save();
            if (!saveResult) {
                serverLog(`[ERROR] Logout fund administrator failed. Failed to save user state data. id: ${id}, fundName: ${fundName}`);
                return {
                    state: 'error',
                    data: null,
                };
            }

            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:fundLogout': ${err}`);
            return {
                state: 'error',
                data: null,
            };
        }
    }
}