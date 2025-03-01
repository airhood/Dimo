const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');
const { getUserAsset, addBalance } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('도박')
        .setDescription('도박이란 재물, 재산상의 이익을 걸고 서로 승부를 다투는 행위입니다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('주사위')
                .setDescription('주사위를 굴려 봇과 대결합니다.')
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('배팅할 금액 (최소 만원)')
                        .setMinValue(10000)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('숫자맞추기')
                .setDescription('1 ~ 16 사이의 숫자를 맞출 시 16배로 돌려받습니다.')
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('배팅할 금액 (최소 만원)')
                        .setMinValue(10000)
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('숫자')
                        .setDescription('배팅할 숫자 (1 ~ 16)')
                        .setMinValue(1)
                        .setMaxValue(16)
                        .setRequired(true)
                )
        )
        ,
    
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === '주사위') {
            const betAmount = interaction.options.getInteger('금액');

            const userAsset = await getUserAsset(interaction.user.id);

            if (userAsset.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                            .setTimestamp()
                    ],
                });
                return;
            }

            if (userAsset.data.asset.balance < betAmount) {
                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x: 잔액 부족')
                            .setDescription('잔액이 부족해서 주사위를 굴릴 수 없습니다.')
                    ],
                });
                return;
            }

            const userNumber = Math.floor(Math.random() * 6) + 1;
            const botNumber = Math.floor(Math.random() * 6) + 1;

            let transactionAmount;
            if (userNumber > botNumber) {
                transactionAmount = betAmount;
            } else if (userNumber === botNumber) {
                transactionAmount = 0;
            } else if (userNumber < botNumber) {
                transactionAmount = -betAmount;
            }

            const result = await addBalance(interaction.user.id, transactionAmount);

            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('서버 오류')
                            .setDescription(`오류가 발생하였습니다.
                                공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                    ],
                });
                return;
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(':game_die:  주사위')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${betAmount}\`\`\``, inline: false },
                            { name: ':game_die: 유저', value: ' ', inline: true },
                            { name: ':game_die: 봇', value: ' ', inline: true },
                            { name: ':moneybag: 수익', value: ' ', inline: true },
                        )
                ],
            });

            const sleep = (ms) => {
                return new Promise((r) => setTimeout(r, ms));
            };

            await sleep(700);

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(':game_die:  주사위')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${betAmount}\`\`\``, inline: false },
                            { name: ':game_die: 유저', value: `:number_${userNumber}:`, inline: true },
                            { name: ':game_die: 봇', value: ' ', inline: true },
                            { name: ':moneybag: 수익', value: ' ', inline: true },
                        )
                ],
            });

            await sleep(700);

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(':game_die:  주사위')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${betAmount}\`\`\``, inline: false },
                            { name: ':game_die: 유저', value: `:number_${userNumber}:`, inline: true },
                            { name: ':game_die: 봇', value: `:number_${botNumber}:`, inline: true },
                            { name: ':moneybag: 수익', value: ` `, inline: true },
                        )
                ],
            });

            await sleep(400);

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(':game_die:  주사위')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${betAmount}\`\`\``, inline: false },
                            { name: ':game_die: 유저', value: `:number_${userNumber}:`, inline: true },
                            { name: ':game_die: 봇', value: `:number_${botNumber}:`, inline: true },
                            { name: ':moneybag: 수익', value: `\`\`\`${transactionAmount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}\`\`\``, inline: true },
                        )
                ],
            });
        } else if (subCommand === '숫자맞추기') {
            const betAmount = interaction.options.getInteger('금액');

            const userAsset = await getUserAsset(interaction.user.id);

            if (userAsset.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('서버 오류')
                            .setDescription(`오류가 발생하였습니다.
                                공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                    ],
                });
                return;
            }
            
            if (userAsset.data.asset.balance < betAmount) {
                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x: 잔액 부족')
                            .setDescription('잔액이 부족해서 주사위를 굴릴 수 없습니다.')
                    ],
                });
                return;
            }

            const userNumber = interaction.options.getInteger('숫자');
            const targetNumber = Math.floor(Math.random() * 16) + 1;

            let transactionAmount;
            if (userNumber === targetNumber) {
                transactionAmount = betAmount * 15;
            } else {
                transactionAmount = -betAmount;
            }

            const result = await addBalance(interaction.user.id, transactionAmount);

            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('서버 오류')
                            .setDescription(`오류가 발생하였습니다.
                                공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                    ],
                });
                return;
            }
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(':game_die:  숫자 맞추기')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${betAmount}\`\`\``, inline: false },
                            { name: ':game_die: 배팅한 숫자', value: `**${userNumber}**`, inline: true },
                            { name: ':game_die: 나온 숫자', value: `**${targetNumber}**`, inline: true },
                            { name: ':moneybag: 수익', value: `\`\`\`${transactionAmount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}\`\`\``, inline: true },
                        )
                ],
            });
        }
    }
}