'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveAsset } = require('../database');
const { getStockPrice, getFuturePrice, getOptionPrice } = require('../systems/stock_sim');
const { getEtfPrice, ETF_DEFINITIONS } = require('../systems/etf_system');
const { getFundPrice } = require('../systems/fund_price');
const { OPTION_UNIT_QUANTITY } = require('../setting');

function fmtPrice(n) {
    return Math.round(n).toLocaleString() + '원';
}

function fmtPct(pct) {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
}

function pnlEmoji(pnl) {
    return pnl > 0 ? '📈' : pnl < 0 ? '📉' : '➖';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('포트폴리오')
        .setDescription('현재 계정의 포트폴리오 손익 분석을 표시합니다.'),

    async execute(interaction) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const result = await getActiveAsset(userId);
        if (result.state === 'error') {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription('자산 정보를 불러올 수 없습니다.')],
            });
        }

        const asset = result.data;
        const isFund = result.isFund;
        const title = isFund ? `📊 포트폴리오 분석 [${result.fundName} 펀드]` : '📊 포트폴리오 분석';

        const fields = [];
        let totalValue = asset.balance;

        // ── 주식 ────────────────────────────────────────────────────────────────
        if (asset.stocks.length > 0) {
            let stockValue = 0;
            let stockCost = 0;
            const lines = [];
            for (const s of asset.stocks) {
                const cur = getStockPrice(s.ticker) ?? s.purchasePrice;
                const value = cur * s.quantity;
                const cost = s.purchasePrice * s.quantity;
                const pnl = value - cost;
                const pct = cost !== 0 ? (pnl / cost) * 100 : 0;
                stockValue += value;
                stockCost += cost;
                lines.push(`\`${s.ticker}\` ${s.quantity}주  ${fmtPrice(cur)}  ${pnlEmoji(pnl)} ${fmtPct(pct)}`);
            }
            const totalPnl = stockValue - stockCost;
            const totalPct = stockCost !== 0 ? (totalPnl / stockCost) * 100 : 0;
            totalValue += stockValue;
            fields.push({
                name: `🏢 주식  (평가: ${fmtPrice(stockValue)}  ${pnlEmoji(totalPnl)} ${fmtPct(totalPct)})`,
                value: lines.slice(0, 10).join('\n') + (lines.length > 10 ? `\n_외 ${lines.length - 10}개_` : ''),
                inline: false,
            });
        }

        // ── 공매도 ──────────────────────────────────────────────────────────────
        if (asset.stockShortSales.length > 0) {
            let shortPnl = 0;
            const lines = [];
            for (const s of asset.stockShortSales) {
                const cur = getStockPrice(s.ticker) ?? s.sellPrice;
                const pnl = (s.sellPrice - cur) * s.quantity;
                const pct = s.sellPrice !== 0 ? ((s.sellPrice - cur) / s.sellPrice) * 100 : 0;
                shortPnl += pnl;
                lines.push(`\`${s.ticker}\` ${s.quantity}주  현재가 ${fmtPrice(cur)}  ${pnlEmoji(pnl)} ${fmtPct(pct)}`);
            }
            fields.push({
                name: `📤 공매도  (미실현 손익: ${pnlEmoji(shortPnl)} ${fmtPrice(Math.abs(shortPnl))})`,
                value: lines.slice(0, 10).join('\n') + (lines.length > 10 ? `\n_외 ${lines.length - 10}개_` : ''),
                inline: false,
            });
        }

        // ── 선물 ────────────────────────────────────────────────────────────────
        if (asset.futures.length > 0) {
            let futuresPnl = 0;
            const lines = [];
            for (const f of asset.futures) {
                const cur = getFuturePrice(f.ticker) ?? f.purchasePrice;
                const pnl = (cur - f.purchasePrice) * f.quantity * f.leverage;
                const pct = f.purchasePrice !== 0 ? ((cur - f.purchasePrice) / f.purchasePrice) * f.leverage * 100 : 0;
                futuresPnl += pnl;
                lines.push(`\`${f.ticker}\` ${f.quantity}계약 (${f.leverage}x)  ${fmtPrice(cur)}  ${pnlEmoji(pnl)} ${fmtPct(pct)}`);
            }
            fields.push({
                name: `📈 선물  (미실현 손익: ${pnlEmoji(futuresPnl)} ${fmtPrice(Math.abs(futuresPnl))})`,
                value: lines.slice(0, 10).join('\n') + (lines.length > 10 ? `\n_외 ${lines.length - 10}개_` : ''),
                inline: false,
            });
        }

        // ── 옵션 ────────────────────────────────────────────────────────────────
        if (asset.options.length > 0) {
            let optionValue = 0;
            let optionCost = 0;
            const lines = [];
            for (const o of asset.options) {
                const optionPrices = getOptionPrice(o.ticker);
                let cur = 0;
                if (optionPrices) {
                    cur = o.optionType === 'call'
                        ? (optionPrices.call[String(o.strikePrice)] ?? 0)
                        : (optionPrices.put[String(o.strikePrice)] ?? 0);
                }
                const value = cur * o.quantity * OPTION_UNIT_QUANTITY;
                const cost = o.purchasePrice * o.quantity * OPTION_UNIT_QUANTITY;
                const pnl = value - cost;
                const pct = cost !== 0 ? (pnl / cost) * 100 : 0;
                optionValue += value;
                optionCost += cost;
                const typeLabel = o.optionType === 'call' ? '콜' : '풋';
                lines.push(`\`${o.ticker}\` ${typeLabel} 행사가${fmtPrice(o.strikePrice)} ${o.quantity}계약  ${pnlEmoji(pnl)} ${fmtPct(pct)}`);
            }
            const totalPnl = optionValue - optionCost;
            const totalPct = optionCost !== 0 ? (totalPnl / optionCost) * 100 : 0;
            totalValue += optionValue;
            fields.push({
                name: `🎯 옵션  (평가: ${fmtPrice(optionValue)}  ${pnlEmoji(totalPnl)} ${fmtPct(totalPct)})`,
                value: lines.slice(0, 10).join('\n') + (lines.length > 10 ? `\n_외 ${lines.length - 10}개_` : ''),
                inline: false,
            });
        }

        // ── ETF ─────────────────────────────────────────────────────────────────
        if (asset.etfs && asset.etfs.length > 0) {
            let etfValue = 0;
            let etfCost = 0;
            const lines = [];
            for (const e of asset.etfs) {
                const cur = getEtfPrice(e.etfId) ?? e.purchasePrice;
                const value = cur * e.quantity;
                const cost = e.purchasePrice * e.quantity;
                const pnl = value - cost;
                const pct = cost !== 0 ? (pnl / cost) * 100 : 0;
                etfValue += value;
                etfCost += cost;
                const shortName = ETF_DEFINITIONS[e.etfId]?.shortName ?? e.etfId;
                lines.push(`\`${shortName}\` ${e.quantity}좌  ${fmtPrice(cur)}  ${pnlEmoji(pnl)} ${fmtPct(pct)}`);
            }
            const totalPnl = etfValue - etfCost;
            const totalPct = etfCost !== 0 ? (totalPnl / etfCost) * 100 : 0;
            totalValue += etfValue;
            fields.push({
                name: `📦 ETF  (평가: ${fmtPrice(etfValue)}  ${pnlEmoji(totalPnl)} ${fmtPct(totalPct)})`,
                value: lines.slice(0, 10).join('\n') + (lines.length > 10 ? `\n_외 ${lines.length - 10}개_` : ''),
                inline: false,
            });
        }

        // ── 펀드 ─────────────────────────────────────────────────────────────────
        if (asset.funds && asset.funds.length > 0) {
            let fundValue = 0;
            let fundCost = 0;
            const lines = [];
            for (const f of asset.funds) {
                const cur = getFundPrice(f.name) ?? f.purchasePrice;
                const value = cur * f.unit;
                const cost = f.purchasePrice * f.unit;
                const pnl = value - cost;
                const pct = cost !== 0 ? (pnl / cost) * 100 : 0;
                fundValue += value;
                fundCost += cost;
                lines.push(`\`${f.name}\` ${f.unit}좌  ${fmtPrice(cur)}  ${pnlEmoji(pnl)} ${fmtPct(pct)}`);
            }
            const totalPnl = fundValue - fundCost;
            const totalPct = fundCost !== 0 ? (totalPnl / fundCost) * 100 : 0;
            totalValue += fundValue;
            fields.push({
                name: `🏦 펀드  (평가: ${fmtPrice(fundValue)}  ${pnlEmoji(totalPnl)} ${fmtPct(totalPct)})`,
                value: lines.slice(0, 10).join('\n') + (lines.length > 10 ? `\n_외 ${lines.length - 10}개_` : ''),
                inline: false,
            });
        }

        if (fields.length === 0) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(title)
                        .setDescription('보유 중인 포지션이 없습니다.')
                        .setTimestamp(),
                ],
            });
        }

        // Summary fields at top
        fields.unshift(
            { name: '💵 계좌 잔액', value: `\`${fmtPrice(asset.balance)}\``, inline: true },
            { name: '📊 추정 총자산', value: `\`${fmtPrice(totalValue)}\``, inline: true },
        );

        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(title)
            .addFields(fields.slice(0, 25))
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
