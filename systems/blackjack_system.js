'use strict';
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { addBalance } = require('../database');
const { loadCache, saveCache, deleteCache } = require('../utils/cache');

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function drawCard() {
    return { suit: SUITS[Math.floor(Math.random() * 4)], value: VALUES[Math.floor(Math.random() * 13)] };
}

function handTotal(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
        if (card.value === 'A') { aces++; total += 11; }
        else if (['10', 'J', 'Q', 'K'].includes(card.value)) total += 10;
        else total += parseInt(card.value);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

function isBlackjack(cards) {
    return cards.length === 2 && handTotal(cards) === 21;
}

function cardNumericValue(card) {
    if (card.value === 'A') return 11;
    if (['10', 'J', 'Q', 'K'].includes(card.value)) return 10;
    return parseInt(card.value);
}

function canSplitHand(hand, isSplit) {
    return hand.isFirstTurn && !isSplit && hand.cards.length === 2 &&
        cardNumericValue(hand.cards[0]) === cardNumericValue(hand.cards[1]);
}

function cardStr(card) {
    return `${card.suit}${card.value}`;
}

function fmt(n) {
    return Math.abs(n).toLocaleString();
}

// game = { hands, activeHand, dealerCards, betAmount, isSplit, resolved, insuranceLost }
function buildActionRow(userId, game) {
    const hand = game.hands[game.activeHand];
    const canDouble = hand.isFirstTurn;
    const splitOk = canSplitHand(hand, game.isSplit);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bj_hit-${userId}`)
            .setLabel('Hit 🃏')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`bj_stand-${userId}`)
            .setLabel('Stand ✋')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`bj_double-${userId}`)
            .setLabel('Double Down ✌️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!canDouble),
        new ButtonBuilder()
            .setCustomId(`bj_split-${userId}`)
            .setLabel('Split 🂠')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!splitOk),
    );
}

function buildInProgressEmbed(game) {
    const { hands, activeHand, dealerCards, betAmount, insuranceLost } = game;
    const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('🃏  블랙잭')
        .addFields({ name: ':coin: 배팅금액', value: `\`\`\`${fmt(betAmount)}원\`\`\``, inline: false });

    if (hands.length === 1) {
        const total = handTotal(hands[0].cards);
        embed.addFields(
            { name: '🧑 나', value: `\`${hands[0].cards.map(cardStr).join(' ')}\` → **${total}**`, inline: true },
            { name: '🤖 딜러', value: `\`${cardStr(dealerCards[0])} ?\``, inline: true },
        );
    } else {
        hands.forEach((hand, i) => {
            const total = handTotal(hand.cards);
            const isActive = i === activeHand && !hand.done;
            const label = isActive ? `🧑 핸드 ${i + 1} ▶` : (hand.done ? `핸드 ${i + 1} ✓` : `핸드 ${i + 1}`);
            embed.addFields({ name: label, value: `\`${hand.cards.map(cardStr).join(' ')}\` → **${total}**`, inline: true });
        });
        embed.addFields({ name: '🤖 딜러', value: `\`${cardStr(dealerCards[0])} ?\``, inline: true });
    }

    if (insuranceLost > 0) {
        embed.addFields({ name: '🛡️ 보험', value: `실패 (-${fmt(insuranceLost)}원)`, inline: false });
    }
    return embed;
}

function buildInsuranceEmbed(playerCards, dealerCards, betAmount) {
    const playerTotal = handTotal(playerCards);
    const insuranceBet = Math.floor(betAmount / 2);
    return new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🃏  블랙잭 — 보험')
        .setDescription(`딜러의 첫 패가 **A** 입니다.\n보험 베팅: **${fmt(insuranceBet)}원** (베팅액의 절반)\n딜러가 블랙잭이면 **2:1** 로 지급됩니다.`)
        .addFields(
            { name: ':coin: 배팅금액', value: `\`\`\`${fmt(betAmount)}원\`\`\``, inline: false },
            { name: '🧑 나', value: `\`${playerCards.map(cardStr).join(' ')}\` → **${playerTotal}**`, inline: true },
            { name: '🤖 딜러', value: `\`${cardStr(dealerCards[0])} ?\``, inline: true },
        );
}

function buildInsuranceRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bj_insure-${userId}`)
            .setLabel('보험 들기 🛡️')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`bj_insure_pass-${userId}`)
            .setLabel('패스')
            .setStyle(ButtonStyle.Secondary),
    );
}

function buildResultEmbed(playerCards, dealerCards, betAmount, transactionAmount, resultText, isDoubled) {
    const playerTotal = handTotal(playerCards);
    const dealerTotal = handTotal(dealerCards);
    const color = transactionAmount > 0 ? 0x2ECC71 : transactionAmount < 0 ? 0xEA4144 : 0xF1C40F;
    const profitStr = (transactionAmount >= 0 ? '+' : '-') + fmt(transactionAmount) + '원';

    return new EmbedBuilder()
        .setColor(color)
        .setTitle('🃏  블랙잭')
        .addFields(
            { name: ':coin: 배팅금액', value: `\`\`\`${fmt(betAmount)}원${isDoubled ? ' (×2 더블다운)' : ''}\`\`\``, inline: false },
            { name: '🧑 나', value: `\`${playerCards.map(cardStr).join(' ')}\` → **${playerTotal}**`, inline: true },
            { name: '🤖 딜러', value: `\`${dealerCards.map(cardStr).join(' ')}\` → **${dealerTotal}**`, inline: true },
            { name: '\u200b', value: '\u200b', inline: false },
            { name: '🏆 결과', value: resultText, inline: true },
            { name: ':moneybag: 수익', value: `\`\`\`${profitStr}\`\`\``, inline: true },
        );
}

// 현재 핸드 완료 후 다음 핸드로 이동하거나 전체 종료
async function handleHandEnd(userId, game, interaction) {
    game.hands[game.activeHand].done = true;

    const nextIdx = game.hands.findIndex((h, i) => i > game.activeHand && !h.done);
    if (nextIdx !== -1) {
        game.activeHand = nextIdx;
        saveCache(`bj_${userId}`, game);
        const embed = buildInProgressEmbed(game);
        const row = buildActionRow(userId, game);
        await interaction.update({ embeds: [embed], components: [row] });
    } else {
        await resolveGame(userId, game, interaction);
    }
}

// 모든 핸드 정산 (딜러 드로우 포함)
async function resolveGame(userId, game, interaction) {
    const { hands, dealerCards, betAmount, insuranceLost } = game;

    while (handTotal(dealerCards) < 17) {
        dealerCards.push(drawCard());
    }
    const dealerTotal = handTotal(dealerCards);

    game.resolved = true;
    saveCache(`bj_${userId}`, game);
    deleteCache(`bj_${userId}`);

    const isSplit = hands.length > 1;
    let totalTransaction = 0;
    const resultParts = [];

    for (let i = 0; i < hands.length; i++) {
        const hand = hands[i];
        const playerTotal = handTotal(hand.cards);
        const effectiveBet = hand.isDoubled ? betAmount * 2 : betAmount;
        const prefix = isSplit ? `핸드 ${i + 1}: ` : '';

        let amount;
        let text;
        if (playerTotal > 21) {
            amount = -effectiveBet;
            text = `${prefix}💀 버스트 (-${fmt(effectiveBet)}원)`;
        } else if (dealerTotal > 21) {
            amount = effectiveBet;
            text = `${prefix}🎉 딜러 버스트 (+${fmt(effectiveBet)}원)`;
        } else if (playerTotal > dealerTotal) {
            amount = effectiveBet;
            text = `${prefix}🎉 승리 (+${fmt(effectiveBet)}원)`;
        } else if (playerTotal === dealerTotal) {
            amount = 0;
            text = `${prefix}🤝 무승부`;
        } else {
            amount = -effectiveBet;
            text = `${prefix}💀 패배 (-${fmt(effectiveBet)}원)`;
        }

        totalTransaction += amount;
        resultParts.push(text);
    }

    if (insuranceLost > 0) {
        resultParts.push(`🛡️ 보험 실패 (-${fmt(insuranceLost)}원)`);
    }

    if (totalTransaction !== 0) {
        await addBalance(userId, totalTransaction);
    }

    const profitStr = (totalTransaction >= 0 ? '+' : '-') + fmt(totalTransaction) + '원';
    const color = totalTransaction > 0 ? 0x2ECC71 : totalTransaction < 0 ? 0xEA4144 : 0xF1C40F;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🃏  블랙잭')
        .addFields({ name: ':coin: 배팅금액', value: `\`\`\`${fmt(betAmount)}원${isSplit ? ' (스플릿)' : ''}\`\`\``, inline: false });

    hands.forEach((hand, i) => {
        const total = handTotal(hand.cards);
        const label = isSplit
            ? `핸드 ${i + 1}${hand.isDoubled ? ' (×2)' : ''}`
            : `🧑 나${hand.isDoubled ? ' (×2 더블다운)' : ''}`;
        embed.addFields({ name: label, value: `\`${hand.cards.map(cardStr).join(' ')}\` → **${total}**`, inline: true });
    });

    embed.addFields(
        { name: '🤖 딜러', value: `\`${dealerCards.map(cardStr).join(' ')}\` → **${dealerTotal}**`, inline: true },
        { name: '\u200b', value: '\u200b', inline: false },
        { name: '🏆 결과', value: resultParts.join('\n'), inline: true },
        { name: ':moneybag: 수익', value: `\`\`\`${profitStr}\`\`\``, inline: true },
    );

    await interaction.update({ embeds: [embed], components: [] });
}

// 보험 선택 후 처리 (bj_insure / bj_insure_pass 버튼 공용)
async function resolveInsurance(userId, tookInsurance, interaction) {
    const game = loadCache(`bj_${userId}`);
    if (!game || game.resolved) {
        return interaction.reply({ content: '게임이 만료되었습니다.', ephemeral: true });
    }

    const playerCards = game.hands[0].cards;
    const { dealerCards, betAmount } = game;
    const insuranceBet = Math.floor(betAmount / 2);
    const dealerBJ = isBlackjack(dealerCards);
    const playerBJ = isBlackjack(playerCards);

    if (dealerBJ) {
        game.resolved = true;
        saveCache(`bj_${userId}`, game);
        deleteCache(`bj_${userId}`);

        let transactionAmount = 0;
        const resultParts = [];

        if (tookInsurance) {
            transactionAmount += insuranceBet * 2;
            resultParts.push(`🛡️ 보험 적중 (+${fmt(insuranceBet * 2)}원)`);
        }

        if (playerBJ) {
            resultParts.push('🤝 메인 핸드 무승부 (블랙잭 vs 블랙잭)');
        } else {
            transactionAmount -= betAmount;
            resultParts.push(`💀 메인 핸드 패배 (-${fmt(betAmount)}원)`);
        }

        if (transactionAmount !== 0) await addBalance(userId, transactionAmount);

        const embed = buildResultEmbed(playerCards, dealerCards, betAmount, transactionAmount, resultParts.join('\n'), false);
        await interaction.update({ embeds: [embed], components: [] });
    } else {
        let insuranceLost = 0;
        if (tookInsurance) {
            insuranceLost = insuranceBet;
            await addBalance(userId, -insuranceLost);
        }

        if (playerBJ) {
            game.resolved = true;
            saveCache(`bj_${userId}`, game);
            deleteCache(`bj_${userId}`);

            const bjWin = Math.floor(betAmount * 1.5);
            await addBalance(userId, bjWin);

            const insNote = insuranceLost > 0 ? `\n🛡️ 보험 실패 (-${fmt(insuranceLost)}원)` : '';
            const embed = buildResultEmbed(playerCards, dealerCards, betAmount, bjWin, `🎉 블랙잭! 승리 (+1.5배)${insNote}`, false);
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            game.insuranceLost = insuranceLost;
            saveCache(`bj_${userId}`, game);

            const embed = buildInProgressEmbed(game);
            const row = buildActionRow(userId, game);
            await interaction.update({ embeds: [embed], components: [row] });
        }
    }
}

// 첫 딜에서 블랙잭 발생 시 즉시 처리 (interaction.reply 사용)
async function resolveBlackjack(userId, playerCards, dealerCards, betAmount, interaction) {
    const playerBJ = isBlackjack(playerCards);
    const dealerBJ = isBlackjack(dealerCards);

    let transactionAmount;
    let resultText;

    if (playerBJ && dealerBJ) {
        transactionAmount = 0;
        resultText = '🤝 무승부 (블랙잭 vs 블랙잭)';
    } else if (playerBJ) {
        transactionAmount = Math.floor(betAmount * 1.5);
        resultText = '🎉 블랙잭! 승리 (+1.5배)';
    } else {
        transactionAmount = -betAmount;
        resultText = '💀 딜러 블랙잭. 패배';
    }

    if (transactionAmount !== 0) {
        await addBalance(userId, transactionAmount);
    }

    const embed = buildResultEmbed(playerCards, dealerCards, betAmount, transactionAmount, resultText, false);
    await interaction.reply({ embeds: [embed], components: [] });
}

module.exports = {
    drawCard,
    handTotal,
    isBlackjack,
    cardStr,
    cardNumericValue,
    canSplitHand,
    buildActionRow,
    buildInProgressEmbed,
    buildInsuranceEmbed,
    buildInsuranceRow,
    buildResultEmbed,
    handleHandEnd,
    resolveGame,
    resolveBlackjack,
    resolveInsurance,
};
