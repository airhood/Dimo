const { getTransactionScheduleData, deleteTransactionSchedule } = require("../database");
const { setFutureExpireCallback, setOptionExpireCallback } = require("./stock_sim");
const { program } = require('commander');

const transaction_schedule_list = [];
const hot_schedule_list = [];

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
                        command: 'buyback stock',
                        asset_id: asset_id,
                        ticker: ticker,
                        quantity: quantity,
                        time: new Date().setTime(time),
                    };

                    transaction_schedule_list.push(transaction_schedule);
                });
            
            program.command('settle future <asset_id>')
                .action((asset_id) => {
                    const transaction_schedule = {
                        command: 'settle future',
                        asset_id: asset_id,
                    };

                    transaction_schedule_list.push(transaction_schedule);
                });
        });
        return true;
    }
    return false;
}

module.exports = {
    async initScheduleManager() {
        const result = cacheTransactionScheduleData();
        if (!result) return false;

        setFutureExpireCallback(() => {

        });

        setOptionExpireCallback(() => {

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