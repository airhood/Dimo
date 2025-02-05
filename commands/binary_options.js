const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { getStockPrice, tryGetTicker } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { checkUserExists } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('바이너리옵션')
        .setDescription('주식의 가격 변동을 맞출 시 투자한 금액에 +70%를 돌려받습니다.')
        .addStringOption((option) =>
            option.setName('종목')
                .setDescription('바이너리 옵션을 매수하려는 종목 코드 또는 종목명')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('예측')
                .setDescription('일정 기간 후 주식 가격에 대한 예측')
                .addChoices(
                    { name: '콜(High)', value: '콜' },
                    { name: '풋(Low)', value: '풋' },
                )
                .setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('시간')
                .setDescription('예측할 시간대')
                .addChoices(
                    { name: "1시간", value: '1시간' },
                    { name: "3시간", value: '3시간' },
                    { name: "10시간", value: '10시간' },
                    { name: "1일", value: '1일' },
                    { name: "3일", value: '3일' },
                )
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName('금액')
                .setDescription('투자할 액수')
                .setRequired(true)
        ),
    
    async execute(interaction) {

    }
}