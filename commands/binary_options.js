const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { getStockPrice, tryGetTicker } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { checkUserExists, binaryOption } = require('../database');

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
                    { name: '콜(High)', value: 'call' },
                    { name: '풋(Low)', value: 'put' },
                )
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName('시간')
                .setDescription('예측할 시간대')
                .addChoices(
                    { name: "1시간", value: 1 },
                    { name: "3시간", value: 3 },
                    { name: "10시간", value: 10 },
                    { name: "1일", value: 24 },
                    { name: "3일", value: 72 },
                )
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName('금액')
                .setDescription('투자할 액수 (최소 1만원)')
                .setMinValue(10000)
                .setRequired(true)
        ),
    
    async execute(interaction) {
        let ticker = interaction.options.getString('종목');
        ticker = tryGetTicker(ticker.trim());
        
        if (ticker === null) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x:  주문 실패')
                        .setDescription(`존재하지 않는 종목입니다.`)
                        .setTimestamp()
                ],
            });
            return;
        }
        
        const prediction = interaction.options.getString('예측');
        const time = interaction.options.getInteger('시간');
        const amount = interaction.options.getInteger('금액');
        
        const result = await binaryOption(interaction.user.id, ticker, prediction, time, amount);

        if (result === null) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x:  주문 실패')
                        .setDescription(`오류가 발생하였습니다.
                            공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                        .setTimestamp()
                ],
            });
            return;
        } else if (result === false) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x:  주문 실패')
                        .setDescription(`잔액이 부족합니다.`)
                        .setTimestamp()
                ],
            });
        } else if (result === true) {
            let direction;
            if (prediction === 'call') {
                direction = '상승';
            } else if (prediction === 'put') {
                direction = '하락';
            }

            let formattedTime;
            if (time === 1) {
                formattedTime = '1시간';
            } else if (time === 3) {
                formattedTime = '3시간';
            } else if (time === 10) {
                formattedTime = '10시간'; 
            } else if (time === 24) {
                formattedTime = '1일';
            } else if (time === 72) {
                formattedTime = '3일';
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x448FE6)
                        .setTitle(':white_check_mark:  주문 체결 완료')
                        .setDescription(`${ticker} 주식 가격의 ${formattedTime} 후 가격이 현재 가격보다 ${direction}한다는 예측에 ${amount}원을 배팅하였습니다.`)
                        .setTimestamp()
                ],
            });
        }
    }
}