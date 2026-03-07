'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveAsset } = require('../database');
const { getStockPrice, getFuturePrice, getOptionPrice } = require('../systems/stock_sim');
const { getEtfPrice, ETF_DEFINITIONS } = require('../systems/etf_system');
const { getFundPrice } = require('../systems/fund_price');
const { calcCurrentValue } = require('../systems/real_estate_system');
const { OPTION_UNIT_QUANTITY } = require('../setting');

function n(num) {
    return Math.round(num).toLocaleString();
}

function formatPercent(val) {
    if (val === 0) return '0.00';
    for (let digits = 2; digits <= 8; digits++) {
        const s = val.toFixed(digits);
        const dec = s.split('.')[1] ?? '';
        if (!/^0+$/.test(dec)) return s;
    }
    return val.toFixed(8);
}

function pct(val) {
    const sign = val >= 0 ? '+' : '';
    return `${sign}${formatPercent(val)}%`;
}

// Format P&L with sign and percent
function pnlLine(pnlVal, pctVal) {
    const sign = pnlVal >= 0 ? '+' : '';
    return `${sign}${n(pnlVal)}원 (${pct(pctVal)})`;
}

// Wrap text in a code block, truncating if it exceeds Discord's 1024-char field limit
function codeBlock(text) {
    const wrapped = `\`\`\`${text}\`\`\``;
    if (wrapped.length <= 1024) return wrapped;
    // Trim lines until it fits
    const lines = text.split('\n');
    let out = '';
    for (const line of lines) {
        const candidate = `\`\`\`${out}${line}\n...(생략)\`\`\``;
        if (candidate.length > 1024) break;
        out += line + '\n';
    }
    return `\`\`\`${out}...(생략)\`\`\``;
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
                embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
            });
        }

        const asset = result.data;
        const isFund = result.isFund;
        const title = isFund ? `📊 포트폴리오 분석 [${result.fundName} 펀드]` : '📊 포트폴리오 분석';

        const fields = [];
        let totalValue = asset.balance;
        let totalPnl = 0;
        let totalCost = 0;

        // ── 주식 ────────────────────────────────────────────────────────────────
        if (asset.stocks.length > 0) {
            let stockValue = 0, stockCost = 0;
            let fmt = '';
            for (const s of asset.stocks) {
                const cur = getStockPrice(s.ticker) ?? s.purchasePrice;
                const value = cur * s.quantity;
                const cost = s.purchasePrice * s.quantity;
                const p = value - cost;
                const pctVal = cost !== 0 ? (p / cost) * 100 : 0;
                stockValue += value;
                stockCost += cost;
                if (fmt) fmt += '\n';
                fmt += `${s.ticker} ${n(s.quantity)}주  현재 ${n(cur)}원  매수 ${n(s.purchasePrice)}원\n| 평가손익: ${pnlLine(p, pctVal)}`;
            }
            const sectionPnl = stockValue - stockCost;
            const sectionPct = stockCost !== 0 ? (sectionPnl / stockCost) * 100 : 0;
            totalValue += stockValue;
            totalPnl += sectionPnl;
            totalCost += stockCost;
            fields.push({
                name: `:chart_with_upwards_trend:  주식  (평가 ${n(stockValue)}원  ${pnlLine(sectionPnl, sectionPct)})`,
                value: codeBlock(fmt),
            });
        }

        // ── 공매도 ──────────────────────────────────────────────────────────────
        if (asset.stockShortSales.length > 0) {
            let shortPnl = 0, shortCost = 0;
            let fmt = '';
            for (const s of asset.stockShortSales) {
                const cur = getStockPrice(s.ticker) ?? s.sellPrice;
                const p = (s.sellPrice - cur) * s.quantity;
                const pctVal = s.sellPrice !== 0 ? ((s.sellPrice - cur) / s.sellPrice) * 100 : 0;
                shortPnl += p;
                shortCost += s.sellPrice * s.quantity;
                if (fmt) fmt += '\n';
                fmt += `${s.ticker} ${n(s.quantity)}주 공매도  현재 ${n(cur)}원  매도 ${n(s.sellPrice)}원\n| 평가손익: ${pnlLine(p, pctVal)}`;
            }
            totalPnl += shortPnl;
            totalCost += shortCost;
            fields.push({
                name: `:arrow_up:  공매도  (미실현 손익: ${pnlLine(shortPnl, 0).split(' ')[0]})`,
                value: codeBlock(fmt),
            });
        }

        // ── 선물 ────────────────────────────────────────────────────────────────
        if (asset.futures.length > 0) {
            let futPnl = 0, futCost = 0;
            let fmt = '';
            for (const f of asset.futures) {
                const cur = getFuturePrice(f.ticker) ?? f.purchasePrice;
                const posType = f.quantity > 0 ? '롱' : '숏';
                const absQty = Math.abs(f.quantity);
                const p = (cur - f.purchasePrice) * f.quantity * f.leverage;
                const earnDir = f.quantity > 0 ? 1 : -1;
                const pctVal = f.purchasePrice !== 0
                    ? ((cur - f.purchasePrice) / f.purchasePrice) * f.leverage * earnDir * 100
                    : 0;
                futPnl += p;
                futCost += f.purchasePrice * absQty;
                if (fmt) fmt += '\n';
                fmt += `${f.ticker} ${posType} ${n(absQty)}계약 (${f.leverage}x)  현재 ${n(cur)}원  매수 ${n(f.purchasePrice)}원\n| 평가손익: ${pnlLine(p, pctVal)}`;
            }
            totalPnl += futPnl;
            totalCost += futCost;
            fields.push({
                name: `:receipt:  선물  (미실현 손익: ${pnlLine(futPnl, 0).split(' ')[0]})`,
                value: codeBlock(fmt),
            });
        }

        // ── 옵션 ────────────────────────────────────────────────────────────────
        if (asset.options.length > 0) {
            let optValue = 0, optCost = 0;
            let fmt = '';
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
                const p = value - cost;
                const pctVal = cost !== 0 ? (p / cost) * 100 : 0;
                optValue += value;
                optCost += cost;
                const typeLabel = o.optionType === 'call' ? '콜' : '풋';
                if (fmt) fmt += '\n';
                fmt += `${o.ticker} ${typeLabel}옵션 ${n(o.quantity)}계약  행사가 ${n(o.strikePrice)}원  현재 ${cur.toFixed(2)}원\n| 평가손익: ${pnlLine(p, pctVal)}`;
            }
            const sectionPnl = optValue - optCost;
            const sectionPct = optCost !== 0 ? (sectionPnl / optCost) * 100 : 0;
            totalValue += optValue;
            totalPnl += sectionPnl;
            totalCost += optCost;
            fields.push({
                name: `:pencil:  옵션  (평가 ${n(optValue)}원  ${pnlLine(sectionPnl, sectionPct)})`,
                value: codeBlock(fmt),
            });
        }

        // ── ETF ─────────────────────────────────────────────────────────────────
        if (asset.etfs && asset.etfs.length > 0) {
            let etfValue = 0, etfCost = 0;
            let fmt = '';
            for (const e of asset.etfs) {
                const cur = getEtfPrice(e.etfId) ?? e.purchasePrice;
                const value = cur * e.quantity;
                const cost = e.purchasePrice * e.quantity;
                const p = value - cost;
                const pctVal = cost !== 0 ? (p / cost) * 100 : 0;
                etfValue += value;
                etfCost += cost;
                const def = ETF_DEFINITIONS[e.etfId];
                const displayName = def ? def.name : e.etfId;
                if (fmt) fmt += '\n';
                fmt += `${displayName} ${n(e.quantity)}좌  현재 ${n(cur)}원  매수 ${n(e.purchasePrice)}원\n| 평가손익: ${pnlLine(p, pctVal)}`;
            }
            const sectionPnl = etfValue - etfCost;
            const sectionPct = etfCost !== 0 ? (sectionPnl / etfCost) * 100 : 0;
            totalValue += etfValue;
            totalPnl += sectionPnl;
            totalCost += etfCost;
            fields.push({
                name: `:bar_chart:  ETF  (평가 ${n(etfValue)}원  ${pnlLine(sectionPnl, sectionPct)})`,
                value: codeBlock(fmt),
            });
        }

        // ── 펀드 ─────────────────────────────────────────────────────────────────
        if (asset.funds && asset.funds.length > 0) {
            let fundValue = 0, fundCost = 0;
            let fmt = '';
            for (const f of asset.funds) {
                const cur = getFundPrice(f.name) ?? f.purchasePrice;
                const value = cur * f.unit;
                const cost = f.purchasePrice * f.unit;
                const p = value - cost;
                const pctVal = cost !== 0 ? (p / cost) * 100 : 0;
                fundValue += value;
                fundCost += cost;
                if (fmt) fmt += '\n';
                fmt += `${f.name} 펀드 ${n(f.unit)}좌  현재 ${n(cur)}원  매수 ${n(f.purchasePrice)}원\n| 평가손익: ${pnlLine(p, pctVal)}`;
            }
            const sectionPnl = fundValue - fundCost;
            const sectionPct = fundCost !== 0 ? (sectionPnl / fundCost) * 100 : 0;
            totalValue += fundValue;
            totalPnl += sectionPnl;
            totalCost += fundCost;
            fields.push({
                name: `:bank:  펀드  (평가 ${n(fundValue)}원  ${pnlLine(sectionPnl, sectionPct)})`,
                value: codeBlock(fmt),
            });
        }

        // ── 부동산 ───────────────────────────────────────────────────────────────
        if (asset.properties && asset.properties.length > 0) {
            let propValue = 0, propCost = 0;
            let fmt = '';
            for (const prop of asset.properties) {
                const cur = calcCurrentValue(prop);
                const cost = prop.purchasePrice;
                const p = cur - cost;
                const pctVal = cost !== 0 ? (p / cost) * 100 : 0;
                propValue += cur;
                propCost += cost;
                if (fmt) fmt += '\n';
                fmt += `${prop.name} (${prop.region} ${prop.type})  현시세 ${n(cur)}원\n| 평가손익: ${pnlLine(p, pctVal)}`;
            }
            const sectionPnl = propValue - propCost;
            const sectionPct = propCost !== 0 ? (sectionPnl / propCost) * 100 : 0;
            totalValue += propValue;
            totalPnl += sectionPnl;
            totalCost += propCost;
            fields.push({
                name: `:house:  부동산  (평가 ${n(propValue)}원  ${pnlLine(sectionPnl, sectionPct)})`,
                value: codeBlock(fmt),
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

        // Summary header
        const totalPnlPct = totalCost !== 0 ? (totalPnl / totalCost) * 100 : 0;

        fields.unshift(
            {
                name: ':dollar:  계좌 잔액',
                value: `\`\`\`${n(asset.balance)}원\`\`\``,
                inline: true,
            },
            {
                name: ':moneybag:  추정 총자산',
                value: `\`\`\`${n(totalValue)}원\`\`\``,
                inline: true,
            },
            {
                name: ':chart_with_upwards_trend:  전체 손익',
                value: `\`\`\`${pnlLine(totalPnl, totalPnlPct)}\`\`\``,
                inline: true,
            },
        );

        const color = totalPnl > 0 ? 0x2ECC71 : totalPnl < 0 ? 0xEA4144 : 0x95A5A6;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .addFields(fields.slice(0, 25))
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
