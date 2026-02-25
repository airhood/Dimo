const mongoose = require('mongoose');
const { mongodb_url }  = require('./config.json');
const { serverLog } = require('./server/server_logger');
const { getStockPrice, getFuturePrice, getFutureExpirationDate, getOptionPrice, getOptionExpirationDate, getOptionStrikePriceList } = require('./systems/stock_sim');
const { getEtfPrice, ETF_DEFINITIONS } = require('./systems/etf_system');
const { getLoanInterestRate, getFixedDepositInterestRate, calculateLoanLimit, getLoanInterestRatePoint, getFixedDepositInterestRatePoint } = require('./systems/bank_manager');
const { calculateFundCreditRating, calculateAssetValue } = require('./systems/credit_system');
require('dotenv').config();
const moment = require('moment-timezone');
const fs = require('fs');
const { getKoreanTime }= require('./utils/korean_time');
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
const Notification = require('./schemas/notification');
const Fund = require('./schemas/fund');

const TransactionSchedule = require('./schemas/transaction_schedule');

const Notice = require('./schemas/notice');
const TransactionLog = require('./schemas/transaction_log');


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
                etfs: [],
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
            const user = await User.findOne({ userID: id }).populate('state');
            if (!user) {
                serverLog('[ERROR] Error finding user');
                return { state: 'error', data: null };
            }

            const currentAccount = user.state.currentAccount;
            if (currentAccount !== '@self') {
                const fundName = currentAccount.replace('@fund_', '');
                const fund = await Fund.findOne({ name: fundName }).populate('asset');
                if (!fund) return { state: 'error', data: null };
                return { state: 'success', data: { asset: fund.asset }, isFund: true, fundName };
            }

            const userWithAsset = await User.findOne({ userID: id }).populate('asset');
            if (!userWithAsset) return { state: 'error', data: null };
            return { state: 'success', data: userWithAsset, isFund: false };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserAsset': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async getUserPersonalAsset(id) {
        try {
            const result = await User.findOne({ userID: id }).populate('asset');
            if (!result) {
                serverLog('[ERROR] Error finding user asset');
                return { state: 'error', data: null };
            }
            return { state: 'success', data: result, isFund: false };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getUserPersonalAsset': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async getFundAsset(fundName) {
        try {
            const fund = await Fund.findOne({ name: fundName }).populate('asset');
            if (!fund) {
                return { state: 'no_fund', data: null };
            }
            return { state: 'success', data: { asset: fund.asset }, isFund: true, fundName };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getFundAsset': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async getActiveAsset(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (!user) return { state: 'error', data: null };

            const userState = await State.findById(user.state);
            if (!userState) return { state: 'error', data: null };

            if (userState.currentAccount !== '@self') {
                const fundName = userState.currentAccount.replace('@fund_', '');
                const fund = await Fund.findOne({ name: fundName }).populate('asset');
                if (!fund) return { state: 'error', data: null };
                return { state: 'success', data: fund.asset, isFund: true, fundName };
            }

            const userAsset = await Asset.findById(user.asset);
            if (!userAsset) return { state: 'error', data: null };
            return { state: 'success', data: userAsset, isFund: false };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getActiveAsset': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async getAssetByAccountKey(id, accountKey) {
        try {
            const user = await User.findOne({ userID: id });
            if (!user) return { state: 'error', data: null };

            if (!accountKey || accountKey === '@self') {
                const userAsset = await Asset.findById(user.asset);
                if (!userAsset) return { state: 'error', data: null };
                return { state: 'success', data: userAsset };
            }

            if (accountKey.startsWith('@fund_')) {
                const fundName = accountKey.replace('@fund_', '');
                const fund = await Fund.findOne({ name: fundName }).populate('asset');
                if (!fund) return { state: 'error', data: null };
                return { state: 'success', data: fund.asset };
            }

            return { state: 'error', data: null };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getAssetByAccountKey': ${err}`);
            return { state: 'error', data: null };
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

    async transferToFund(fromUserID, fundName, amount) {
        try {
            if (isServersideLocked(fromUserID)) {
                return { state: 'locked', data: null };
            }

            const user = await User.findOne({ userID: fromUserID });
            if (!user) {
                serverLog(`[ERROR] transferToFund: user not found. id: ${fromUserID}`);
                return { state: 'error', data: null };
            }

            const fund = await Fund.findOne({ name: fundName }).populate('asset');
            if (!fund) {
                serverLog(`[INFO] transferToFund: fund not found. fundName: ${fundName}`);
                return { state: 'no_fund', data: null };
            }

            const userAsset = await Asset.findById(user.asset);
            if (!userAsset) {
                serverLog(`[ERROR] transferToFund: user asset not found. id: ${fromUserID}`);
                return { state: 'error', data: null };
            }

            if (userAsset.balance < amount) {
                serverLog(`[INFO] transferToFund: insufficient balance. id: ${fromUserID}`);
                return { state: 'no_balance', data: null };
            }

            userAsset.balance -= amount;
            userAsset.balance = Math.round(userAsset.balance);
            const saveFromResult = await userAsset.save();
            if (!saveFromResult) {
                serverLog(`[ERROR] transferToFund: failed to save user asset. id: ${fromUserID}`);
                return { state: 'error', data: null };
            }

            fund.asset.balance += amount;
            fund.asset.balance = Math.round(fund.asset.balance);
            const saveFundResult = await fund.asset.save();
            if (!saveFundResult) {
                serverLog(`[ERROR] transferToFund: failed to save fund asset. Rolling back. id: ${fromUserID}`);
                userAsset.balance += amount;
                userAsset.balance = Math.round(userAsset.balance);
                const rollback = await userAsset.save();
                if (!rollback) {
                    serverLog(`[ERROR] transferToFund: rollback failed. Locking account. id: ${fromUserID}`);
                    serversideLockAccount(fromUserID);
                }
                return { state: 'error', data: null };
            }

            serverLog(`[INFO] transferToFund: ${amount}원 from ${fromUserID} to fund '${fundName}'.`);
            return { state: 'success', data: null };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:transferToFund': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async addBalance(id, amount) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return { state: 'error', data: null };
            }
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return { state: 'error', data: null };
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
                return { state: 'error', data: null };
            }
            const userAsset = await Asset.findById(user.asset);
            if (userAsset === null) {
                serverLog('[ERROR] Error finding user asset');
                return { state: 'error', data: null };
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const currentPrice = getStockPrice(ticker);

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / currentPrice);
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'stock_buy', `${ticker} ${quantity}주 매수 (${transactionAmount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const currentPrice = getStockPrice(ticker);

            if (quantity > 0 && quantity < 1) {
                let totalOwned = 0;
                for (const stock of userAsset.stocks) {
                    if (stock.ticker === ticker) totalOwned += stock.quantity;
                }
                quantity = Math.floor(totalOwned * quantity);
                if (quantity === 0) {
                    return {
                        state: 'no_stock',
                        data: null,
                    };
                }
            }

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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'stock_sell', `${ticker} ${quantity}주 매도 (${transactionAmount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const currentPrice = getStockPrice(ticker);

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / (currentPrice * SHORT_SELL_MARGIN_RATE));
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
                if (quantity === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'stock_short_sell', `${ticker} ${quantity}주 공매도 (매도가 ${currentPrice.toLocaleString()}원, 증거금 ${margin.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'stock_short_repay', `${ticker} 공매도 상환 ${quantity}주`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const currentPrice = getFuturePrice(ticker);

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / currentPrice);
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'future_long', `${ticker} 선물 매수 ${quantity}계약 (레버리지 ${leverage}배, 증거금 ${margin.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const currentPrice = getStockPrice(ticker);

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / currentPrice);
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'future_short', `${ticker} 선물 매도 ${quantity}계약 (레버리지 ${leverage}배, 증거금 ${margin.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'future_liquidate', `${ticker} 선물 청산 (손익 ${(transactionAmount - margin) >= 0 ? '+' : ''}${Math.round(transactionAmount - margin).toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const strikePriceList = getOptionStrikePriceList(ticker);
            if (!strikePriceList || !strikePriceList.includes(strikePrice)) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            const optionPrices = getOptionPrice(ticker);
            const currentPrice = optionPrices.call[strikePrice.toString()] ?? 0;
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'call_option_buy', `${ticker} 콜옵션 매수 ${quantity}계약 (행사가 ${strikePrice.toLocaleString()}원, ${transactionAmount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const strikePriceList = getOptionStrikePriceList(ticker);
            if (!strikePriceList || !strikePriceList.includes(strikePrice)) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            const optionPrices = getOptionPrice(ticker);
            const currentPrice = optionPrices.call[strikePrice.toString()] ?? 0;
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'call_option_sell', `${ticker} 콜옵션 매도 ${quantity}계약 (행사가 ${strikePrice.toLocaleString()}원, ${transactionAmount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const strikePriceList = getOptionStrikePriceList(ticker);
            if (!strikePriceList || !strikePriceList.includes(strikePrice)) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            const optionPrices = getOptionPrice(ticker);
            const currentPrice = optionPrices.put[strikePrice.toString()] ?? 0;
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'put_option_buy', `${ticker} 풋옵션 매수 ${quantity}계약 (행사가 ${strikePrice.toLocaleString()}원, ${transactionAmount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            const strikePriceList = getOptionStrikePriceList(ticker);
            if (!strikePriceList || !strikePriceList.includes(strikePrice)) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            const optionPrices = getOptionPrice(ticker);
            const currentPrice = optionPrices.put[strikePrice.toString()] ?? 0;
            if (!currentPrice) {
                return {
                    state: 'invalid_strike_price',
                    data: null,
                };
            }

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / (currentPrice * OPTION_UNIT_QUANTITY));
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'put_option_sell', `${ticker} 풋옵션 매도 ${quantity}계약 (행사가 ${strikePrice.toLocaleString()}원, ${transactionAmount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'option_liquidate', `${ticker} ${optionType === 'call' ? '콜' : '풋'}옵션 청산 (${transactionAmount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            if (amount >= 0 && amount < 1) {
                amount = amount === 0 ? userAsset.balance : Math.floor(userAsset.balance * amount);
                if (amount === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
            }

            if (userAsset.balance < amount) {
                return {
                    state: 'no_balance',
                    data: null,
                };
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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'binary_option', `${ticker} 바이너리옵션 ${prediction === 'up' ? '상승' : '하락'} ${time}시간 (${amount.toLocaleString()}원)`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

            let creditRatingValue;
            if (activeAsset.isFund) {
                creditRatingValue = calculateFundCreditRating(userAsset);
            } else {
                const creditRating = await module.exports.getUserCredit(id);
                if (creditRating.state === 'error') {
                    return {
                        state: 'error',
                        data: null,
                    };
                }
                creditRatingValue = creditRating.data;
            }

            const loanLimit = calculateLoanLimit(userAsset, creditRatingValue, dueDate);

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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'loan', `대출 ${amount.toLocaleString()}원 (${interestType})`);
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
            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return {
                    state: 'error',
                    data: null,
                };
            }
            const userAsset = activeAsset.data;

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

            const isOnTime = new Date() <= new Date(loan.dueDate);
            userAsset.loanHistory.push({
                amount: loan.amount,
                onTime: isOnTime,
                repaidAt: new Date(),
            });

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
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'loan_repay', `대출 상환 ${Math.round(transactionAmount).toLocaleString()}원`);
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
                serverLog(`[WARN] deleteTransactionSchedule: schedule not found. identification_code: ${identification_code}`);
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

            if (amount >= 0 && amount < 1) {
                amount = amount === 0 ? userAsset.balance : Math.floor(userAsset.balance * amount);
                if (amount === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
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

            if (amount >= 0 && amount < 1) {
                amount = amount === 0 ? userAsset.balance : Math.floor(userAsset.balance * amount);
                if (amount === 0) {
                    return {
                        state: 'no_balance',
                        data: null,
                    };
                }
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

    async addNotification(userID, alertScope, targetPnL, direction, options = {}) {
        try {
            const { type, positionNum, ticker, strikePrice } = options;
            const notification = await Notification.create({
                userID,
                alertScope,
                type: type ?? undefined,
                positionNum: positionNum ?? undefined,
                ticker: ticker ?? undefined,
                strikePrice: strikePrice ?? undefined,
                targetPnL,
                direction,
                nextCheckAt: new Date(),
            });
            if (!notification) {
                serverLog(`[ERROR] addNotification: failed to create notification.`);
                return { state: 'error', data: null };
            }
            return { state: 'success', data: notification };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:addNotification': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async deleteNotification(userID, notificationNum) {
        try {
            const notifications = await Notification.find({ userID }).sort({ createdAt: 1 });
            if (notificationNum < 1 || notificationNum > notifications.length) {
                return { state: 'invalid_num', data: null };
            }
            const target = notifications[notificationNum - 1];
            await Notification.deleteOne({ _id: target._id });
            return { state: 'success', data: null };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:deleteNotification': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async getNotifications(userID) {
        try {
            const notifications = await Notification.find({ userID }).sort({ createdAt: 1 });
            return { state: 'success', data: notifications };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getNotifications': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async resetNotification(userID) {
        try {
            await Notification.deleteMany({ userID });
            return { state: 'success', data: null };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:resetNotification': ${err}`);
            return { state: 'error', data: null };
        }
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

    async fundCreate(id, fundName, description, fee, initialAmount) {
        try {
            const creatorUser = await User.findOne({ userID: id });
            if (!creatorUser) {
                serverLog(`[ERROR] fundCreate: User not found for userID=${id}`);
                return { state: 'error', data: null };
            }
            const creatorAsset = await Asset.findById(creatorUser.asset);
            if (!creatorAsset) {
                serverLog(`[ERROR] fundCreate: Asset not found for userID=${id}, assetId=${creatorUser.asset}`);
                return { state: 'error', data: null };
            }
            if (creatorAsset.balance < initialAmount) {
                serverLog(`[INFO] fundCreate insufficient_balance: balance=${creatorAsset.balance}, required=${initialAmount}`);
                return {
                    state: 'insufficient_balance',
                    data: { balance: creatorAsset.balance },
                };
            }

            const asset = await Asset.create({
                balance: initialAmount,
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
                total_units: Math.floor(initialAmount / 1000),
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

            creatorAsset.balance -= initialAmount;
            await creatorAsset.save();

            // 생성 즉시 가격 캐시 등록 (다음 시간 업데이트 전에도 /자산에서 가격이 표시되도록)
            const { setFundPrice } = require('./systems/fund_price');
            const initialUnitPrice = fund.total_units > 0 ? initialAmount / fund.total_units : 1000;
            setFundPrice(fundName, initialUnitPrice);

            module.exports.addTransactionLog(id, 'fund_create', `${fundName} 펀드 개설 (초기 자금 ${initialAmount.toLocaleString()}원)`);
            return {
                state: 'success',
                data: null,
            };
        } catch (err) {
            if (err.code === 11000) {
                return {
                    state: 'duplicate_name',
                    data: null,
                };
            }
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
                serverLog(`[INFO] fundAddAdministrator: fund not found. fundName: ${fundName}`);
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
                serverLog(`[INFO] fundRemoveAdministrator: fund not found. fundName: ${fundName}`);
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

            if (administrator.isTopAdmin) {
                return {
                    state: 'cannot_remove_owner',
                    data: null,
                };
            }

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
                serverLog(`[INFO] fundGetAdministrators: fund not found. fundName: ${fundName}`);
                return {
                    state: 'no_fund',
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
                serverLog(`[INFO] fundLogin: fund not found. fundName: ${fundName}`);
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
    },

    async fundTransferOwnership(id, fundName, newOwnerId) {
        try {
            const fund = await Fund.findOne({ name: fundName });
            if (!fund) {
                serverLog(`[INFO] fundTransferOwnership: fund not found. fundName: ${fundName}`);
                return { state: 'no_fund', data: null };
            }

            const currentOwner = fund.administrators.find(a => a.isTopAdmin);
            if (!currentOwner || currentOwner.userID !== id) {
                serverLog(`[INFO] fundTransferOwnership: not owner. id: ${id}, fundName: ${fundName}`);
                return { state: 'not_owner', data: null };
            }

            const newOwnerAdmin = fund.administrators.find(a => a.userID === newOwnerId);
            if (!newOwnerAdmin) {
                return { state: 'not_admin', data: null };
            }

            currentOwner.isTopAdmin = false;
            newOwnerAdmin.isTopAdmin = true;

            await fund.save();

            return { state: 'success', data: null };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:fundTransferOwnership': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async investFund(id, fundName, amount) {
        try {
            const user = await User.findOne({ userID: id });
            if (!user) {
                serverLog(`[ERROR] investFund: user not found. id: ${id}`);
                return { state: 'error', data: null };
            }

            const userAsset = await Asset.findById(user.asset);
            if (!userAsset) {
                serverLog(`[ERROR] investFund: user asset not found. id: ${id}`);
                return { state: 'error', data: null };
            }

            const fund = await Fund.findOne({ name: fundName }).populate('asset');
            if (!fund) {
                serverLog(`[INFO] investFund: fund not found. fundName: ${fundName}`);
                return { state: 'no_fund', data: null };
            }

            // 실시간 가격 계산 (요청 시점의 펀드 자산 가치 기준)
            const totalAssetValue = calculateAssetValue(fund.asset);
            const unitPrice = fund.total_units > 0 ? totalAssetValue / fund.total_units : 1000;

            if (amount >= 0 && amount < 1) {
                amount = amount === 0 ? userAsset.balance : Math.floor(userAsset.balance * amount);
                if (amount === 0) {
                    return { state: 'insufficient_balance', data: { balance: userAsset.balance } };
                }
            }

            const units = Math.floor(amount / unitPrice);
            if (units <= 0) {
                return { state: 'insufficient_amount', data: { unitPrice } };
            }

            const actualCost = units * unitPrice;

            if (userAsset.balance < actualCost) {
                return { state: 'insufficient_balance', data: { balance: userAsset.balance } };
            }

            userAsset.balance -= actualCost;
            fund.asset.balance += actualCost;
            fund.total_units += units;

            userAsset.funds.push({
                name: fundName,
                unit: units,
                purchasePrice: unitPrice,
                purchaseDate: new Date(),
            });

            await userAsset.save();
            await fund.asset.save();
            await fund.save();

            // 거래 후 캐시 즉시 갱신 (가격은 수학적으로 동일하지만 /자산 표시 동기화)
            const { setFundPrice } = require('./systems/fund_price');
            const newUnitPrice = fund.total_units > 0 ? (totalAssetValue + actualCost) / fund.total_units : 1000;
            setFundPrice(fundName, newUnitPrice);

            module.exports.addTransactionLog(id, 'fund_invest', `${fundName} 펀드 투자 ${units}좌 (단가 ${Math.round(unitPrice).toLocaleString()}원, 총 ${Math.round(actualCost).toLocaleString()}원)`);
            return { state: 'success', data: { units, unitPrice, actualCost } };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:investFund': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async sellFundInvestment(id, fundName, units) {
        try {
            const user = await User.findOne({ userID: id });
            if (!user) {
                serverLog(`[ERROR] sellFundInvestment: user not found. id: ${id}`);
                return { state: 'error', data: null };
            }

            const userAsset = await Asset.findById(user.asset);
            if (!userAsset) {
                serverLog(`[ERROR] sellFundInvestment: user asset not found. id: ${id}`);
                return { state: 'error', data: null };
            }

            const totalUserUnits = userAsset.funds
                .filter(f => f.name === fundName)
                .reduce((sum, f) => sum + f.unit, 0);

            if (totalUserUnits === 0) {
                return { state: 'no_investment', data: null };
            }

            if (units > 0 && units < 1) {
                units = Math.floor(totalUserUnits * units);
                if (units === 0) {
                    return { state: 'no_investment', data: null };
                }
            }

            if (totalUserUnits < units) {
                return { state: 'insufficient_units', data: { ownedUnits: totalUserUnits } };
            }

            const fund = await Fund.findOne({ name: fundName }).populate('asset');
            if (!fund) {
                serverLog(`[INFO] sellFundInvestment: fund not found. fundName: ${fundName}`);
                return { state: 'no_fund', data: null };
            }

            // 실시간 가격 계산 (요청 시점의 펀드 자산 가치 기준)
            const totalAssetValue = calculateAssetValue(fund.asset);
            const unitPrice = fund.total_units > 0 ? totalAssetValue / fund.total_units : 1000;
            const currentValue = units * unitPrice;

            // FIFO: remove units oldest-first, track weighted average purchase price
            let unitsToRemove = units;
            let weightedPurchaseCost = 0;
            const newFunds = [];
            for (const holding of userAsset.funds) {
                if (holding.name !== fundName || unitsToRemove <= 0) {
                    newFunds.push(holding);
                    continue;
                }
                if (holding.unit <= unitsToRemove) {
                    weightedPurchaseCost += holding.unit * holding.purchasePrice;
                    unitsToRemove -= holding.unit;
                } else {
                    weightedPurchaseCost += unitsToRemove * holding.purchasePrice;
                    holding.unit -= unitsToRemove;
                    unitsToRemove = 0;
                    newFunds.push(holding);
                }
            }
            userAsset.funds = newFunds;

            // Fee applies only to profit
            const profit = currentValue - weightedPurchaseCost;
            let feeAmount = 0;
            if (profit > 0) {
                feeAmount = profit * (fund.fee / 100);
            }
            const investorProceeds = currentValue - feeAmount;

            userAsset.balance += investorProceeds;
            fund.asset.balance -= currentValue;
            fund.total_units -= units;

            await userAsset.save();
            await fund.asset.save();
            await fund.save();

            // Transfer fee to fund owner's personal account
            if (feeAmount > 0) {
                const ownerAdmin = fund.administrators.find(a => a.isTopAdmin);
                if (ownerAdmin) {
                    const ownerUser = await User.findOne({ userID: ownerAdmin.userID });
                    if (ownerUser) {
                        const ownerAsset = await Asset.findById(ownerUser.asset);
                        if (ownerAsset) {
                            ownerAsset.balance += feeAmount;
                            await ownerAsset.save();
                            module.exports.addTransactionLog(ownerAdmin.userID, 'fund_fee', `${fundName} 펀드 수수료 수령 (${Math.round(feeAmount).toLocaleString()}원)`);
                        }
                    }
                }
            }

            // 거래 후 캐시 즉시 갱신
            const { setFundPrice } = require('./systems/fund_price');
            const newUnitPrice = fund.total_units > 0 ? (totalAssetValue - currentValue) / fund.total_units : 1000;
            setFundPrice(fundName, newUnitPrice);

            module.exports.addTransactionLog(id, 'fund_sell', `${fundName} 펀드 환매 ${units}좌 (수익 ${profit >= 0 ? '+' : ''}${Math.round(profit).toLocaleString()}원, 수령 ${Math.round(investorProceeds).toLocaleString()}원)`);
            return { state: 'success', data: { units, unitPrice, currentValue, weightedPurchaseCost, profit, feeAmount, investorProceeds } };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:sellFundInvestment': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async fundRename(id, oldName, newName) {
        try {
            const fund = await Fund.findOne({ name: oldName });
            if (!fund) {
                return { state: 'no_fund', data: null };
            }

            // Only topAdmin can rename the fund
            const adminEntry = fund.administrators.find(a => a.userID === id);
            if (!adminEntry || !adminEntry.isTopAdmin) {
                return { state: 'not_owner', data: null };
            }

            // Check new name isn't already taken
            const existing = await Fund.findOne({ name: newName });
            if (existing) {
                return { state: 'duplicate_name', data: null };
            }

            // Update fund document name
            fund.name = newName;
            await fund.save();

            // Update all asset holdings with this fund name
            await Asset.updateMany(
                { 'funds.name': oldName },
                { $set: { 'funds.$[elem].name': newName } },
                { arrayFilters: [{ 'elem.name': oldName }] }
            );

            // Update State.currentAccount for any admin logged into this fund
            await State.updateMany(
                { currentAccount: `@fund_${oldName}` },
                { $set: { currentAccount: `@fund_${newName}` } }
            );

            // Update Notification ticker for fund notifications
            await Notification.updateMany(
                { type: 'fund', ticker: oldName },
                { $set: { ticker: newName } }
            );

            // Update price cache
            const { renameFundPrice } = require('./systems/fund_price');
            renameFundPrice(oldName, newName);

            return { state: 'success', data: null };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:fundRename': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async checkAndGrantAchievements(id) {
        try {
            const { ACHIEVEMENTS } = require('./systems/achievement_system');

            const user = await User.findOne({ userID: id });
            if (!user) return { state: 'error', data: null };

            const profile = await Profile.findById(user.profile);
            if (!profile) return { state: 'error', data: null };

            const userAsset = await Asset.findById(user.asset);
            if (!userAsset) return { state: 'error', data: null };

            // 한 번의 집계 쿼리로 모든 거래 타입별 카운트 수집
            const typeCounts = await TransactionLog.aggregate([
                { $match: { userID: id } },
                { $group: { _id: '$type', count: { $sum: 1 } } },
            ]);
            const logCounts = {};
            typeCounts.forEach(t => { logCounts[t._id] = t.count; });
            const totalTransactions = Object.values(logCounts).reduce((s, c) => s + c, 0);

            const earnedNames = new Set(profile.achievements.map(a => a.name));
            const context = { level: profile.level.level, asset: userAsset, logCounts, totalTransactions };

            const newAchievements = [];
            for (const achievement of ACHIEVEMENTS) {
                if (earnedNames.has(achievement.name)) continue;
                if (achievement.check(context)) {
                    profile.achievements.push({ name: achievement.name, description: achievement.description });
                    newAchievements.push({ name: achievement.name, description: achievement.description });
                }
            }

            if (newAchievements.length > 0) {
                await profile.save();
            }

            return { state: 'success', data: newAchievements };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:checkAndGrantAchievements': ${err}`);
            return { state: 'error', data: null };
        }
    },

    addTransactionLog(userID, type, logMessage) {
        TransactionLog.create({ userID, type, logMessage }).catch((err) => {
            serverLog(`[ERROR] Error at 'database.js:addTransactionLog': ${err}`);
        });
    },

    async getTransactionLog(userID, limit) {
        try {
            const logs = await TransactionLog.find({ userID })
                .sort({ transactionDate: -1 })
                .limit(limit);
            return { state: 'success', data: logs };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:getTransactionLog': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async etfBuy(id, etfId, quantity) {
        try {
            if (!ETF_DEFINITIONS[etfId]) {
                return { state: 'invalid_etf', data: null };
            }

            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return { state: 'error', data: null };
            }
            const userAsset = activeAsset.data;

            const currentPrice = getEtfPrice(etfId);
            if (!currentPrice) {
                return { state: 'error', data: null };
            }

            if (quantity >= 0 && quantity < 1) {
                const maxQuantity = Math.floor(userAsset.balance / currentPrice);
                quantity = quantity === 0 ? maxQuantity : Math.floor(maxQuantity * quantity);
                if (quantity === 0) {
                    return { state: 'no_balance', data: null };
                }
            }

            const transactionAmount = currentPrice * quantity;

            if (userAsset.balance < transactionAmount) {
                return { state: 'no_balance', data: null };
            }

            userAsset.balance -= transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);

            const purchaseDate = new Date();

            if (!userAsset.etfs) userAsset.etfs = [];
            userAsset.etfs.push({
                etfId,
                quantity,
                purchasePrice: currentPrice,
                purchaseDate,
            });

            await userAsset.save();

            serverLog(`[INFO] ETF buy success. id: ${id}, etfId: ${etfId}, quantity: ${quantity}`);
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'etf_buy', `${ETF_DEFINITIONS[etfId].name} ${quantity}좌 매수 (${transactionAmount.toLocaleString()}원)`);
            return { state: 'success', data: quantity };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:etfBuy': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async etfSell(id, etfId, quantity) {
        try {
            if (!ETF_DEFINITIONS[etfId]) {
                return { state: 'invalid_etf', data: null };
            }

            const activeAsset = await module.exports.getActiveAsset(id);
            if (activeAsset.state === 'error') {
                return { state: 'error', data: null };
            }
            const userAsset = activeAsset.data;

            const currentPrice = getEtfPrice(etfId);
            if (!currentPrice) {
                return { state: 'error', data: null };
            }

            if (!userAsset.etfs) userAsset.etfs = [];

            const totalOwned = userAsset.etfs
                .filter(e => e.etfId === etfId)
                .reduce((sum, e) => sum + e.quantity, 0);

            if (quantity > 0 && quantity < 1) {
                quantity = Math.floor(totalOwned * quantity);
                if (quantity === 0) {
                    return { state: 'no_etf', data: null };
                }
            }

            if (quantity === 0) {
                quantity = totalOwned;
            }

            if (totalOwned < quantity) {
                return { state: 'no_etf', data: null };
            }

            let quantityLeft = quantity;
            for (let i = userAsset.etfs.length - 1; i >= 0 && quantityLeft > 0; i--) {
                const etf = userAsset.etfs[i];
                if (etf.etfId !== etfId) continue;
                if (etf.quantity <= quantityLeft) {
                    quantityLeft -= etf.quantity;
                    userAsset.etfs.splice(i, 1);
                } else {
                    etf.quantity -= quantityLeft;
                    quantityLeft = 0;
                }
            }

            const transactionAmount = currentPrice * quantity;
            userAsset.balance += transactionAmount;
            userAsset.balance = Math.round(userAsset.balance);

            await userAsset.save();

            serverLog(`[INFO] ETF sell success. id: ${id}, etfId: ${etfId}, quantity: ${quantity}`);
            module.exports.addTransactionLog(activeAsset.isFund ? `@fund_${activeAsset.fundName}` : id, 'etf_sell', `${ETF_DEFINITIONS[etfId].name} ${quantity}좌 매도 (${transactionAmount.toLocaleString()}원)`);
            return { state: 'success', data: quantity };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:etfSell': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async checkAndMarkAttendance(id) {
        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return { state: 'error', data: null };
            }

            const userState = await State.findById(user.state);
            if (userState === null) {
                serverLog('[ERROR] Error finding user state');
                return { state: 'error', data: null };
            }

            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);

            let newStreak;
            if (userState.checkin_date == null) {
                newStreak = 1;
            } else {
                const lastDay = new Date(userState.checkin_date);
                lastDay.setHours(0, 0, 0, 0);
                const diffDays = Math.round((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));

                if (diffDays === 0) {
                    return { state: 'success', data: { alreadyChecked: true } };
                } else if (diffDays === 1) {
                    newStreak = (userState.checkin_streak || 0) + 1;
                } else {
                    newStreak = 1;
                }
            }

            const xpGained = 30;

            userState.checkin_date = now;
            userState.checkin_streak = newStreak;
            await userState.save();

            return { state: 'success', data: { alreadyChecked: false, streak: newStreak, xpGained } };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:checkAndMarkAttendance': ${err}`);
            return { state: 'error', data: null };
        }
    },

    async increaseLevelPointBy(id, amount) {
        const DEFAULT_POINT_REQUIRED = 100;
        const LEVEL_UP_POINT_GAP = 20;

        try {
            const user = await User.findOne({ userID: id });
            if (user === null) {
                serverLog('[ERROR] Error finding user');
                return { state: 'error', data: null };
            }

            const userProfile = await Profile.findById(user.profile);
            if (userProfile === null) {
                serverLog('[ERROR] Error finding user profile');
                return { state: 'error', data: null };
            }

            userProfile.level.state += amount;
            let threshold = DEFAULT_POINT_REQUIRED + LEVEL_UP_POINT_GAP * userProfile.level.level;
            while (userProfile.level.state >= threshold) {
                userProfile.level.state -= threshold;
                userProfile.level.level += 1;
                threshold = DEFAULT_POINT_REQUIRED + LEVEL_UP_POINT_GAP * userProfile.level.level;
            }

            await userProfile.save();

            return {
                state: 'success',
                data: {
                    level: userProfile.level.level,
                    state: userProfile.level.state,
                    target: threshold,
                },
            };
        } catch (err) {
            serverLog(`[ERROR] Error at 'database.js:increaseLevelPointBy': ${err}`);
            return { state: 'error', data: null };
        }
    },
}