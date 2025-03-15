const mongoose = require('mongoose');
const { mongodb_url }  = require('../config.json');


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

async function connectDatabase() {
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
}

const Profile = require('../schemas/profile');
const Asset = require('../schemas/asset');
const State = require('../schemas/state');

const migrateAddCreditRating = async () => {
    try {
        // const result = await Asset.updateMany(
        //     { },
        //     { $set: {
        //         balance: 150 * 10000, // 150만원
        //         stocks: [],
        //         stockShortSales: [],
        //         futures: [],
        //         options: [],
        //         binary_options: [],
        //         fixed_deposits: [],
        //         savings_accounts: [],
        //         loans: [],
        //     } }
        // );

        // const result = await Profile.updateMany(
        //     { },
        //     { $push: { achievements: {
        //         name: '초기유저',
        //         description: '디모봇을 베타 시절부터 사용했어요!',
        //     } } }
        // );

        // const result = await Profile.updateMany(
        //     { credit_rating: { $exists: false } },  // credit_rating 필드가 없는 문서만 선택
        //     { $set: { credit_rating: 100 } }        // credit_rating을 100으로 설정
        // );

        const result = await State.updateMany(
            { currentAccount: { $exists: false } },
            { $set: { currentAccount: '@self' } }
        );

        // const result = await Asset.updateMany(
        //     { funds: { $exists: false } },
        //     { $set: { funds: [] } }
        // );

        // const find = await Asset.findOne(
        //     { _id: '67cd88f2d615039c8d8ece6a' },
        // );

        // if (!find) {
        //     console.error('Asset not found!!');
        //     return;
        // }


        // find.fixed_deposits.forEach((fixed_deposit) => {
        //     // find.balance += fixed_deposit.amount * fixed_deposit.interestRate;
        // });

        // find.fixed_deposits = [];

        // const result = await find.save();
        // if (!result) {
        //     console.error('Save asset failed!!');
        //     return;
        // }

        // console.log(`Matched ${result.matchedCount} documents and updated ${result.modifiedCount} documents.`);
    } catch (err) {
        console.error('Error during migration:', err);
    }
};

connectDatabase().then(async () => {
    await migrateAddCreditRating();
}).then(() => {
    process.exit();
});
