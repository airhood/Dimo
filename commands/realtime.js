const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { getUserAsset, getAllUserAsset } = require('../database');
const { buildAssetFields } = require('../utils/asset_render');
const { getStockList, getFutureList, getOptionPrice, getOptionStrikePriceList, tryGetTicker, getStockTimeRangeData, getFutureTimeRangeData } = require('../systems/stock_sim');
const { getStockName } = require('../systems/stock_name');
const { getDISDAQIndex, getDISDAQIndexTimeRangeData } = require('../systems/stock_index_system');
const { generateStockChartImage, generateIndexChartImage } = require('../systems/stock_chart');
const { calculateAssetValue } = require('../systems/credit_system');
const { startSession, restoreSession, stopSession, getSessionsByUser, stopSessionByIndex, loadPersistedSessions } = require('../systems/realtime_manager');
const { getCachedChart } = require('../systems/chart_cache');
const { getUserChartSettings } = require('../systems/chart_settings');
const { serverLog } = require('../server/server_logger');

const INDEX_CHOICES = [
    { name: 'DISDAQ', value: 'DISDAQ' },
];

const fmt = (n) => n.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');

function makeStopButton(userId, uid) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`realtime_stop-${userId}-${uid}`)
            .setLabel('⏹ 정지')
            .setStyle(ButtonStyle.Danger)
    );
}

// ─── embed builders ──────────────────────────────────────────────────────────

async function buildAssetEmbed(userId) {
    const result = await getUserAsset(userId);
    if (result.state === 'error') return null;
    const { fields } = await buildAssetFields(result.data.asset, false);
    const title = result.isFund
        ? `:bank:  실시간 자산 [${result.fundName} 펀드]`
        : `:bank:  실시간 자산`;
    return {
        embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle(title).addFields(fields).setTimestamp()],
    };
}

const EMBED_DESC_LIMIT = 4096;

// Split lines into embeds, each within Discord's description character limit.
function buildListEmbeds(title, lines) {
    const embeds = [];
    let current = '';
    for (const line of lines) {
        const addition = (current ? '\n' : '') + line;
        if (current.length + addition.length > EMBED_DESC_LIMIT) {
            embeds.push(new EmbedBuilder().setColor(0xF1C40F).setTitle(embeds.length === 0 ? title : `${title} (계속)`).setDescription(current));
            current = line;
        } else {
            current += addition;
        }
    }
    if (current) {
        embeds.push(new EmbedBuilder().setColor(0xF1C40F).setTitle(embeds.length === 0 ? title : `${title} (계속)`).setDescription(current));
    }
    if (embeds.length > 0) embeds[embeds.length - 1].setTimestamp();
    return embeds;
}

function buildStockListEmbed(sortingOption) {
    const stockList = getStockList();
    let sorted;
    if (sortingOption === '가격순(높은)') sorted = [...stockList].sort((a, b) => b.price - a.price);
    else if (sortingOption === '가격순(낮은)') sorted = [...stockList].sort((a, b) => a.price - b.price);
    else if (sortingOption === '상승순') sorted = [...stockList].sort((a, b) => b.difference - a.difference);
    else sorted = [...stockList].sort((a, b) => a.difference - b.difference);

    const lines = sorted.map((stock) => {
        const sign = stock.difference > 0 ? '+' : stock.difference < 0 ? '-' : '=';
        const diffSign = stock.difference > 0 ? '+' : stock.difference < 0 ? '-' : '';
        return `${getStockName(stock.ticker)} [${stock.ticker}]\n\`\`\`diff\n${sign} ${fmt(stock.price)} (${diffSign}${Math.abs(stock.difference).toFixed(2)})\n\`\`\``;
    });

    return { embeds: buildListEmbeds(':chart_with_upwards_trend:  실시간 주식 목록', lines) };
}

function buildFutureListEmbed(sortingOption) {
    const futureList = getFutureList();
    let sorted;
    if (sortingOption === '가격순(높은)') sorted = [...futureList].sort((a, b) => b.price - a.price);
    else if (sortingOption === '가격순(낮은)') sorted = [...futureList].sort((a, b) => a.price - b.price);
    else if (sortingOption === '상승순') sorted = [...futureList].sort((a, b) => b.difference - a.difference);
    else sorted = [...futureList].sort((a, b) => a.difference - b.difference);

    const lines = sorted.map((future) => {
        const sign = future.difference > 0 ? '+' : future.difference < 0 ? '-' : '=';
        const diffSign = future.difference > 0 ? '+' : future.difference < 0 ? '-' : '';
        return `${getStockName(future.ticker)} [${future.ticker}]\n\`\`\`diff\n${sign} ${fmt(future.price)} (${diffSign}${Math.abs(future.difference).toFixed(2)})\n\`\`\``;
    });

    return { embeds: buildListEmbeds(':chart_with_upwards_trend:  실시간 선물 목록', lines) };
}

function buildOptionPriceEmbed(ticker) {
    const optionPrices = getOptionPrice(ticker);
    if (!optionPrices) return null;
    const strikePriceList = getOptionStrikePriceList(ticker);
    const { call, put } = optionPrices;

    let callFormat = '';
    for (let i = 0; i < strikePriceList.length; i++) {
        const price = call[strikePriceList[i].toString()] ?? '---';
        callFormat += `\n${fmt(strikePriceList[i])}원: ${price}`;
    }

    let putFormat = '';
    for (let i = 0; i < strikePriceList.length; i++) {
        const price = put[strikePriceList[i].toString()] ?? '---';
        putFormat += `\n${fmt(strikePriceList[i])}원: ${price}`;
    }

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(`실시간 ${ticker} 옵션 가격`)
                .addFields(
                    { name: ':chart_with_upwards_trend:  콜옵션', value: `\`\`\`${callFormat}\`\`\`` },
                    { name: ':chart_with_downwards_trend:  풋옵션', value: `\`\`\`${putFormat}\`\`\`` },
                )
                .setTimestamp(),
        ],
    };
}

function buildIndexEmbed(indicator) {
    switch (indicator) {
        case 'DISDAQ': {
            const value = getDISDAQIndex();
            return {
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(`실시간 [${indicator}]`)
                        .setDescription(`\`\`\`${fmt(value)}원\`\`\``)
                        .setTimestamp(),
                ],
            };
        }
        default:
            return null;
    }
}

async function buildLeaderboardEmbed() {
    const result = await getAllUserAsset();
    if (result.state === 'error') return null;

    const ranked = (result.data ?? [])
        .map(user => ({ userID: user.userID, assetValue: calculateAssetValue(user.asset) }))
        .sort((a, b) => b.assetValue - a.assetValue)
        .slice(0, 10);

    const medals = [':first_place:', ':second_place:', ':third_place:'];
    const lines = ranked.map((user, i) => {
        const medal = medals[i] ?? `**${i + 1}.**`;
        return `${medal} <@${user.userID}> — \`${user.assetValue.toFixed(0).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',')}원\``;
    });

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(':trophy:  실시간 자산 순위 TOP 10')
                .setDescription(lines.length ? lines.join('\n') : '등록된 유저가 없습니다.')
                .setTimestamp(),
        ],
    };
}

async function buildStockChartEmbed(tickerList, hoursAgo, minutesAgo, userId) {
    const tickers = Array.isArray(tickerList) ? tickerList : [tickerList];
    const settings = userId ? getUserChartSettings(userId) : {};
    const settingsKey = `${(settings.chartType ?? 'area')}_${(settings.candleInterval ?? 2)}_${(settings.indicators ?? []).join('-')}`;
    const key = `stock_${tickers.join(',')}_${hoursAgo}h_${minutesAgo}m_${settingsKey}`;
    const charts = await getCachedChart(key, () =>
        generateStockChartImage(tickers, getStockTimeRangeData(tickers, hoursAgo, minutesAgo), minutesAgo, settings)
    );
    const chartArr = Array.isArray(charts) ? charts : [charts];
    const mainChart = chartArr[0];
    const embeds = [
        new EmbedBuilder()
            .setTitle(':chart_with_upwards_trend:  실시간 주가 차트')
            .setImage(`attachment://${mainChart.filename}`)
            .setTimestamp(),
    ];
    chartArr.slice(1).forEach(panel => {
        embeds.push(new EmbedBuilder().setTitle(panel.label).setImage(`attachment://${panel.filename}`));
    });
    return {
        embeds,
        files: chartArr.map(c => ({ attachment: c.filepath, name: c.filename })),
    };
}

async function buildFutureChartEmbed(tickerList, hoursAgo, minutesAgo, userId) {
    const tickers = Array.isArray(tickerList) ? tickerList : [tickerList];
    const settings = userId ? getUserChartSettings(userId) : {};
    const settingsKey = `${(settings.chartType ?? 'area')}_${(settings.candleInterval ?? 2)}_${(settings.indicators ?? []).join('-')}`;
    const key = `future_${tickers.join(',')}_${hoursAgo}h_${minutesAgo}m_${settingsKey}`;
    const charts = await getCachedChart(key, () =>
        generateStockChartImage(tickers, getFutureTimeRangeData(tickers, hoursAgo, minutesAgo), minutesAgo, settings)
    );
    const chartArr = Array.isArray(charts) ? charts : [charts];
    const mainChart = chartArr[0];
    const embeds = [
        new EmbedBuilder()
            .setTitle(':chart_with_upwards_trend:  실시간 선물 차트')
            .setImage(`attachment://${mainChart.filename}`)
            .setTimestamp(),
    ];
    chartArr.slice(1).forEach(panel => {
        embeds.push(new EmbedBuilder().setTitle(panel.label).setImage(`attachment://${panel.filename}`));
    });
    return {
        embeds,
        files: chartArr.map(c => ({ attachment: c.filepath, name: c.filename })),
    };
}

async function buildIndexChartEmbed(indicator, hoursAgo) {
    const key = `index_${indicator}_${hoursAgo}h`;
    const result = await getCachedChart(key, () => {
        const timeRangeData = getDISDAQIndexTimeRangeData(hoursAgo, 0);
        return generateIndexChartImage(indicator, timeRangeData);
    });
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle(`:chart_with_upwards_trend:  실시간 ${indicator} 차트`)
                .setImage(`attachment://${result.filename}`)
                .setTimestamp(),
        ],
        files: [{ attachment: result.filepath, name: result.filename }],
    };
}

// ─── session restore ──────────────────────────────────────────────────────────

async function restorePersistedSessions(client) {
    const saved = loadPersistedSessions();
    if (saved.length === 0) return;

    let restored = 0;
    for (const s of saved) {
        const { uid, userId, type, channelId, messageId, isChart, startedAt, sessionType, params } = s;

        // 채널/메시지 존재 여부 및 정지 버튼 유무 확인
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            if (!message.components || message.components.length === 0) continue;
        } catch {
            continue;
        }

        let updateFn;
        switch (sessionType) {
            case '자산':      updateFn = () => buildAssetEmbed(params.userId); break;
            case '주식목록':  updateFn = () => buildStockListEmbed(params.sort); break;
            case '선물목록':  updateFn = () => buildFutureListEmbed(params.sort); break;
            case '옵션가격':  updateFn = () => buildOptionPriceEmbed(params.ticker); break;
            case '지수':      updateFn = () => buildIndexEmbed(params.indicator); break;
            case '순위':      updateFn = () => buildLeaderboardEmbed(); break;
            case '주식차트':  updateFn = () => buildStockChartEmbed(params.tickerList ?? params.ticker, params.hoursAgo, params.minutes, params.userId); break;
            case '선물차트':  updateFn = () => buildFutureChartEmbed(params.tickerList ?? params.ticker, params.hoursAgo, params.minutes, params.userId); break;
            case '지수차트':  updateFn = () => buildIndexChartEmbed(params.indicator, params.hoursAgo); break;
            default: continue;
        }

        restoreSession(uid, userId, type, channelId, messageId, client, updateFn, isChart, sessionType, params, startedAt);
        restored++;
    }

    if (restored > 0) {
        const { serverLog } = require('../server/server_logger');
        serverLog(`[INFO] Restored ${restored} realtime session(s).`);
    }
}

// ─── error embed ─────────────────────────────────────────────────────────────

function errorEmbed() {
    return new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp();
}

// ─── command definition ───────────────────────────────────────────────────────

module.exports = {
    restorePersistedSessions,
    data: new SlashCommandBuilder()
        .setName('실시간')
        .setDescription('1분마다 자동으로 업데이트되는 실시간 정보를 표시합니다.')
        .addSubcommand((sub) =>
            sub.setName('자산')
                .setDescription('내 자산 현황을 실시간으로 표시합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('주식목록')
                .setDescription('주식 가격 목록을 실시간으로 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('정렬기준')
                        .setDescription('정렬 기준')
                        .addChoices(
                            { name: '가격순(높은)', value: '가격순(높은)' },
                            { name: '가격순(낮은)', value: '가격순(낮은)' },
                            { name: '상승순', value: '상승순' },
                            { name: '하락순', value: '하락순' },
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('선물목록')
                .setDescription('선물 계약 목록을 실시간으로 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('정렬기준')
                        .setDescription('정렬 기준')
                        .addChoices(
                            { name: '가격순(높은)', value: '가격순(높은)' },
                            { name: '가격순(낮은)', value: '가격순(낮은)' },
                            { name: '상승순', value: '상승순' },
                            { name: '하락순', value: '하락순' },
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('옵션가격')
                .setDescription('종목별 옵션 가격을 실시간으로 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('종목')
                        .setDescription('옵션 종목 코드 또는 이름')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('지수')
                .setDescription('지수 현재가를 실시간으로 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('지수명')
                        .setDescription('확인할 지수')
                        .addChoices(...INDEX_CHOICES)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('순위')
                .setDescription('자산 순위 TOP 10을 실시간으로 표시합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('주식차트')
                .setDescription('주식 차트를 실시간으로 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('종목')
                        .setDescription('종목 코드 또는 이름. 여러 개는 쉼표로 구분 (ex: SSGS, GRPW)')
                        .setRequired(true)
                )
                .addIntegerOption((opt) => opt.setName('일').setDescription('기간 (일)').setMinValue(0).setRequired(false))
                .addIntegerOption((opt) => opt.setName('시간').setDescription('기간 (시간)').setMinValue(0).setRequired(false))
                .addIntegerOption((opt) => opt.setName('분').setDescription('기간 (분)').setMinValue(0).setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('선물차트')
                .setDescription('선물 차트를 실시간으로 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('종목')
                        .setDescription('종목 코드 또는 이름. 여러 개는 쉼표로 구분 (ex: SSGS, GRPW)')
                        .setRequired(true)
                )
                .addIntegerOption((opt) => opt.setName('일').setDescription('기간 (일)').setMinValue(0).setRequired(false))
                .addIntegerOption((opt) => opt.setName('시간').setDescription('기간 (시간)').setMinValue(0).setRequired(false))
                .addIntegerOption((opt) => opt.setName('분').setDescription('기간 (분)').setMinValue(0).setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('지수차트')
                .setDescription('지수 차트를 실시간으로 표시합니다.')
                .addStringOption((opt) =>
                    opt.setName('지수명')
                        .setDescription('확인할 지수')
                        .addChoices(...INDEX_CHOICES)
                        .setRequired(true)
                )
                .addIntegerOption((opt) => opt.setName('일').setDescription('기간 (일)').setMinValue(0).setRequired(false))
                .addIntegerOption((opt) => opt.setName('시간').setDescription('기간 (시간)').setMinValue(0).setRequired(false))
        )
        .addSubcommand((sub) =>
            sub.setName('목록')
                .setDescription('현재 활성화된 나의 실시간 세션 목록을 표시합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('정지')
                .setDescription('특정 번호의 실시간 세션을 정지합니다.')
                .addIntegerOption((opt) =>
                    opt.setName('번호')
                        .setDescription('정지할 세션 번호 (/실시간 목록에서 확인)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const uid = uuidv4().replace(/-/g, '');

        // ── 자산 ──────────────────────────────────────────────────────────────
        if (subCommand === '자산') {
            const initial = await buildAssetEmbed(userId);
            if (!initial) {
                await interaction.reply({ embeds: [errorEmbed()], ephemeral: true });
                return;
            }
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(uid, userId, '자산', msg.channelId, msg.id, interaction.client, () => buildAssetEmbed(userId), false, '자산', { userId });

        // ── 주식목록 ──────────────────────────────────────────────────────────
        } else if (subCommand === '주식목록') {
            const sort = interaction.options.getString('정렬기준') ?? '가격순(높은)';
            const initial = buildStockListEmbed(sort);
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(uid, userId, `주식목록 (${sort})`, msg.channelId, msg.id, interaction.client, () => buildStockListEmbed(sort), false, '주식목록', { sort });

        // ── 선물목록 ──────────────────────────────────────────────────────────
        } else if (subCommand === '선물목록') {
            const sort = interaction.options.getString('정렬기준') ?? '가격순(높은)';
            const initial = buildFutureListEmbed(sort);
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(uid, userId, `선물목록 (${sort})`, msg.channelId, msg.id, interaction.client, () => buildFutureListEmbed(sort), false, '선물목록', { sort });

        // ── 옵션가격 ──────────────────────────────────────────────────────────
        } else if (subCommand === '옵션가격') {
            let ticker = interaction.options.getString('종목');
            ticker = tryGetTicker(ticker.trim());
            if (!ticker) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  가격 불러오기 실패').setDescription('존재하지 않는 종목입니다.')],
                });
                return;
            }
            const initial = buildOptionPriceEmbed(ticker);
            if (!initial) {
                await interaction.reply({ embeds: [errorEmbed()], ephemeral: true });
                return;
            }
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(uid, userId, `옵션가격 (${ticker})`, msg.channelId, msg.id, interaction.client, () => buildOptionPriceEmbed(ticker), false, '옵션가격', { ticker });

        // ── 지수 ──────────────────────────────────────────────────────────────
        } else if (subCommand === '지수') {
            const indicator = interaction.options.getString('지수명');
            const initial = buildIndexEmbed(indicator);
            if (!initial) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('지수 불러오기 실패').setDescription('존재하지 않는 지수입니다.')],
                });
                return;
            }
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(uid, userId, `지수 (${indicator})`, msg.channelId, msg.id, interaction.client, () => buildIndexEmbed(indicator), false, '지수', { indicator });

        // ── 순위 ──────────────────────────────────────────────────────────────
        } else if (subCommand === '순위') {
            const initial = await buildLeaderboardEmbed();
            if (!initial) {
                await interaction.reply({ embeds: [errorEmbed()], ephemeral: true });
                return;
            }
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(uid, userId, '순위', msg.channelId, msg.id, interaction.client, () => buildLeaderboardEmbed(), false, '순위', {});

        // ── 주식차트 ──────────────────────────────────────────────────────────
        } else if (subCommand === '주식차트') {
            const tickerInput = interaction.options.getString('종목');
            const tickerList = tickerInput.split(',').map(t => tryGetTicker(t.trim())).filter(Boolean);
            if (tickerList.length === 0) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  차트 불러오기 실패').setDescription('존재하지 않는 종목입니다.')],
                });
                return;
            }
            let days = interaction.options.getInteger('일') ?? 0;
            let hours = interaction.options.getInteger('시간') ?? 0;
            let minutes = interaction.options.getInteger('분') ?? 0;
            if (days === 0 && hours === 0 && minutes === 0) hours = 6;
            const hoursAgo = (days * 24) + hours;

            const stockSettings = getUserChartSettings(userId);
            if (stockSettings.chartType === 'candlestick' && tickerList.length > 1) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  차트 불러오기 실패').setDescription('캔들차트는 단일 종목만 지원합니다.').setTimestamp()],
                });
                return;
            }

            await interaction.deferReply();
            const initial = await buildStockChartEmbed(tickerList, hoursAgo, minutes, userId);
            const stopRow = makeStopButton(userId, uid);
            await interaction.editReply({ embeds: initial.embeds, files: initial.files, components: [stopRow] });
            const msg = await interaction.fetchReply();
            const stockLabel = tickerList.join(', ');
            startSession(uid, userId, `주식차트 (${stockLabel})`, msg.channelId, msg.id, interaction.client,
                () => buildStockChartEmbed(tickerList, hoursAgo, minutes, userId), true, '주식차트', { tickerList, hoursAgo, minutes, userId });

        // ── 선물차트 ──────────────────────────────────────────────────────────
        } else if (subCommand === '선물차트') {
            const tickerInput = interaction.options.getString('종목');
            const tickerList = tickerInput.split(',').map(t => tryGetTicker(t.trim())).filter(Boolean);
            if (tickerList.length === 0) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  차트 불러오기 실패').setDescription('존재하지 않는 종목입니다.')],
                });
                return;
            }
            let days = interaction.options.getInteger('일') ?? 0;
            let hours = interaction.options.getInteger('시간') ?? 0;
            let minutes = interaction.options.getInteger('분') ?? 0;
            if (days === 0 && hours === 0 && minutes === 0) hours = 6;
            const hoursAgo = (days * 24) + hours;

            const futureSettings = getUserChartSettings(userId);
            if (futureSettings.chartType === 'candlestick' && tickerList.length > 1) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  차트 불러오기 실패').setDescription('캔들차트는 단일 종목만 지원합니다.').setTimestamp()],
                });
                return;
            }

            await interaction.deferReply();
            const initial = await buildFutureChartEmbed(tickerList, hoursAgo, minutes, userId);
            const stopRow = makeStopButton(userId, uid);
            await interaction.editReply({ embeds: initial.embeds, files: initial.files, components: [stopRow] });
            const msg = await interaction.fetchReply();
            const futureLabel = tickerList.join(', ');
            startSession(uid, userId, `선물차트 (${futureLabel})`, msg.channelId, msg.id, interaction.client,
                () => buildFutureChartEmbed(tickerList, hoursAgo, minutes, userId), true, '선물차트', { tickerList, hoursAgo, minutes, userId });

        // ── 지수차트 ──────────────────────────────────────────────────────────
        } else if (subCommand === '지수차트') {
            const indicator = interaction.options.getString('지수명');
            let days = interaction.options.getInteger('일') ?? 0;
            let hours = interaction.options.getInteger('시간') ?? 0;
            if (days === 0 && hours === 0) hours = 6;
            const hoursAgo = (days * 24) + hours;

            await interaction.deferReply();
            const initial = await buildIndexChartEmbed(indicator, hoursAgo);
            const stopRow = makeStopButton(userId, uid);
            await interaction.editReply({ embeds: initial.embeds, files: initial.files, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(uid, userId, `지수차트 (${indicator})`, msg.channelId, msg.id, interaction.client,
                () => buildIndexChartEmbed(indicator, hoursAgo), true, '지수차트', { indicator, hoursAgo });

        // ── 목록 ──────────────────────────────────────────────────────────────
        } else if (subCommand === '목록') {
            const list = getSessionsByUser(userId);
            if (list.length === 0) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('⏱  실시간 세션 목록').setDescription('활성화된 실시간 세션이 없습니다.').setTimestamp()],
                    ephemeral: true,
                });
                return;
            }
            const lines = list.map((s, i) => {
                const ts = Math.floor(s.startedAt.getTime() / 1000);
                return `**${i + 1}.** ${s.type} — <t:${ts}:R> 시작`;
            });
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('⏱  실시간 세션 목록')
                        .setDescription(lines.join('\n'))
                        .setFooter({ text: '/실시간 정지 [번호] 로 특정 세션을 정지할 수 있습니다.' })
                        .setTimestamp()
                ],
                ephemeral: true,
            });

        // ── 정지 ──────────────────────────────────────────────────────────────
        } else if (subCommand === '정지') {
            const index = interaction.options.getInteger('번호');
            const session = stopSessionByIndex(userId, index);
            if (!session) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  정지 실패').setDescription(`${index}번 세션을 찾을 수 없습니다.`)],
                    ephemeral: true,
                });
                return;
            }
            // Remove stop button from the session's message
            try {
                const channel = await interaction.client.channels.fetch(session.channelId);
                const message = await channel.messages.fetch(session.messageId);
                await message.edit({ components: [] });
            } catch {}
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('⏹  세션 정지').setDescription(`**${index}번** 실시간 세션이 정지되었습니다.`).setTimestamp()],
                ephemeral: true,
            });
        }
    }
};
