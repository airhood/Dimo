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
        .addSubcommand((subCommand) =>
            subCommand.setName('바카라')
                .setDescription('바카라를 플레이합니다. 플레이어/뱅커/타이 중 하나에 베팅하세요.')
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('배팅할 금액 (최소 만원)')
                        .setMinValue(10000)
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option.setName('베팅')
                        .setDescription('베팅할 대상')
                        .addChoices(
                            { name: '🔵 플레이어 (1배)', value: '플레이어' },
                            { name: '🔴 뱅커 (0.95배)', value: '뱅커' },
                            { name: '🟡 타이 (8배)', value: '타이' },
                        )
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
        } else if (subCommand === '바카라') {
            const betAmount = interaction.options.getInteger('금액');
            const betChoice = interaction.options.getString('베팅');

            const userAsset = await getUserAsset(interaction.user.id);
            if (userAsset.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
                return;
            }
            if (userAsset.data.asset.balance < betAmount) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x: 잔액 부족').setDescription('잔액이 부족해서 바카라를 플레이할 수 없습니다.')],
                });
                return;
            }

            // Card helpers
            const SUITS = ['♠', '♥', '♦', '♣'];
            const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
            const drawCard = () => ({ suit: SUITS[Math.floor(Math.random() * 4)], value: VALUES[Math.floor(Math.random() * 13)] });
            const cardValue = (card) => (['10', 'J', 'Q', 'K'].includes(card.value) ? 0 : card.value === 'A' ? 1 : parseInt(card.value));
            const handValue = (cards) => cards.reduce((sum, c) => sum + cardValue(c), 0) % 10;
            const cardStr = (card) => `${card.suit}${card.value}`;
            const fmt = (n) => n.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');

            // Deal initial cards
            const playerCards = [drawCard(), drawCard()];
            const bankerCards = [drawCard(), drawCard()];
            let playerTotal = handValue(playerCards);
            let bankerTotal = handValue(bankerCards);

            let playerThird = null;
            let bankerThird = null;

            const isNatural = playerTotal >= 8 || bankerTotal >= 8;
            if (!isNatural) {
                // Player draws if hand ≤ 5
                if (playerTotal <= 5) {
                    playerThird = drawCard();
                    playerCards.push(playerThird);
                    playerTotal = handValue(playerCards);
                }

                // Banker drawing rules
                if (playerThird === null) {
                    if (bankerTotal <= 5) {
                        bankerThird = drawCard();
                        bankerCards.push(bankerThird);
                        bankerTotal = handValue(bankerCards);
                    }
                } else {
                    const p3v = cardValue(playerThird);
                    let bankerDraws = false;
                    if (bankerTotal <= 2) bankerDraws = true;
                    else if (bankerTotal === 3) bankerDraws = p3v !== 8;
                    else if (bankerTotal === 4) bankerDraws = [2, 3, 4, 5, 6, 7].includes(p3v);
                    else if (bankerTotal === 5) bankerDraws = [4, 5, 6, 7].includes(p3v);
                    else if (bankerTotal === 6) bankerDraws = [6, 7].includes(p3v);
                    if (bankerDraws) {
                        bankerThird = drawCard();
                        bankerCards.push(bankerThird);
                        bankerTotal = handValue(bankerCards);
                    }
                }
            }

            // Determine winner
            let winner;
            if (playerTotal > bankerTotal) winner = '플레이어';
            else if (bankerTotal > playerTotal) winner = '뱅커';
            else winner = '타이';

            // Calculate payout
            let transactionAmount;
            const isPush = winner === '타이' && betChoice !== '타이';
            if (isPush) {
                transactionAmount = 0;
            } else if (winner === betChoice) {
                transactionAmount = betChoice === '뱅커' ? Math.floor(betAmount * 0.95) : betChoice === '타이' ? betAmount * 8 : betAmount;
            } else {
                transactionAmount = -betAmount;
            }

            if (transactionAmount !== 0) {
                const result = await addBalance(interaction.user.id, transactionAmount);
                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                }
            }

            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const betLabel = betChoice === '플레이어' ? '🔵 플레이어' : betChoice === '뱅커' ? '🔴 뱅커' : '🟡 타이';
            const winnerLabel = winner === '플레이어' ? '🔵 플레이어' : winner === '뱅커' ? '🔴 뱅커' : '🟡 타이';
            const resultLabel = isPush
                ? '🔁 무승부 (배팅금 반환)'
                : transactionAmount >= 0
                    ? `+${fmt(transactionAmount)}원`
                    : `${fmt(transactionAmount)}원`;
            const embedColor = transactionAmount > 0 ? 0x2ECC71 : transactionAmount < 0 ? 0xEA4144 : 0xF1C40F;

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('🃏  바카라')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${fmt(betAmount)}원\`\`\``, inline: false },
                            { name: ':blue_circle: 플레이어', value: '`? ?`', inline: true },
                            { name: ':red_circle: 뱅커', value: '`? ?`', inline: true },
                        )
                ],
            });

            await sleep(800);

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('🃏  바카라')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${fmt(betAmount)}원\`\`\``, inline: false },
                            { name: ':blue_circle: 플레이어', value: `\`${playerCards.map(cardStr).join(' ')}\` → **${playerTotal}**`, inline: true },
                            { name: ':red_circle: 뱅커', value: '`? ?`', inline: true },
                        )
                ],
            });

            await sleep(800);

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(embedColor)
                        .setTitle('🃏  바카라')
                        .addFields(
                            { name: ':coin: 배팅금액', value: `\`\`\`${fmt(betAmount)}원\`\`\``, inline: false },
                            { name: ':blue_circle: 플레이어', value: `\`${playerCards.map(cardStr).join(' ')}\` → **${playerTotal}**`, inline: true },
                            { name: ':red_circle: 뱅커', value: `\`${bankerCards.map(cardStr).join(' ')}\` → **${bankerTotal}**`, inline: true },
                            { name: '\u200b', value: '\u200b', inline: false },
                            { name: '🏆 결과', value: winnerLabel, inline: true },
                            { name: ':dart: 베팅', value: betLabel, inline: true },
                            { name: ':moneybag: 수익', value: `\`\`\`${resultLabel}\`\`\``, inline: true },
                        )
                ],
            });
        }
    }
}