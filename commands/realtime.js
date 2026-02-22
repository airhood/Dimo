const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { getUserAsset, getAllUserAsset } = require('../database');
const { buildAssetFields } = require('../utils/asset_render');
const { getStockList, getFutureList, getOptionPrice, getOptionStrikePriceList, tryGetTicker, getStockTimeRangeData, getFutureTimeRangeData } = require('../stock_system/stock_sim');
const { getStockName } = require('../stock_system/stock_name');
const { getDISDAQIndex, getDISDAQIndexTimeRangeData } = require('../stock_system/stock_index_system');
const { generateStockChartImage, generateIndexChartImage } = require('../stock_system/stock_chart');
const { calculateAssetValue } = require('../stock_system/credit_system');
const { startSession } = require('../stock_system/realtime_manager');
const { getCachedChart } = require('../stock_system/chart_cache');
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

function buildStockListEmbed(sortingOption) {
    const stockList = getStockList();
    let sorted;
    if (sortingOption === '가격순(높은)') sorted = [...stockList].sort((a, b) => b.price - a.price);
    else if (sortingOption === '가격순(낮은)') sorted = [...stockList].sort((a, b) => a.price - b.price);
    else if (sortingOption === '상승순') sorted = [...stockList].sort((a, b) => b.difference - a.difference);
    else sorted = [...stockList].sort((a, b) => a.difference - b.difference);

    const lines = sorted.slice(0, 10).map((stock) => {
        const sign = stock.difference > 0 ? '+' : stock.difference < 0 ? '-' : '=';
        const diffSign = stock.difference > 0 ? '+' : stock.difference < 0 ? '-' : '';
        return `${getStockName(stock.ticker)} [${stock.ticker}]\n\`\`\`diff\n${sign} ${fmt(stock.price)} (${diffSign}${Math.abs(stock.difference).toFixed(2)})\n\`\`\``;
    });

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(':chart_with_upwards_trend:  실시간 주식 목록')
                .setDescription(lines.join('\n'))
                .setTimestamp(),
        ],
    };
}

function buildFutureListEmbed(sortingOption) {
    const futureList = getFutureList();
    let sorted;
    if (sortingOption === '가격순(높은)') sorted = [...futureList].sort((a, b) => b.price - a.price);
    else if (sortingOption === '가격순(낮은)') sorted = [...futureList].sort((a, b) => a.price - b.price);
    else if (sortingOption === '상승순') sorted = [...futureList].sort((a, b) => b.difference - a.difference);
    else sorted = [...futureList].sort((a, b) => a.difference - b.difference);

    const lines = sorted.slice(0, 10).map((future) => {
        const sign = future.difference > 0 ? '+' : future.difference < 0 ? '-' : '=';
        const diffSign = future.difference > 0 ? '+' : future.difference < 0 ? '-' : '';
        return `${getStockName(future.ticker)} [${future.ticker}]\n\`\`\`diff\n${sign} ${fmt(future.price)} (${diffSign}${Math.abs(future.difference).toFixed(2)})\n\`\`\``;
    });

    return {
        embeds: [
            new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(':chart_with_upwards_trend:  실시간 선물 목록')
                .setDescription(lines.join('\n'))
                .setTimestamp(),
        ],
    };
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

async function buildStockChartEmbed(ticker, hoursAgo, minutesAgo) {
    const key = `stock_${ticker}_${hoursAgo}h_${minutesAgo}m`;
    const result = await getCachedChart(key, () =>
        generateStockChartImage(ticker, getStockTimeRangeData([ticker], hoursAgo, minutesAgo), minutesAgo)
    );
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle(':chart_with_upwards_trend:  실시간 주가 차트')
                .setImage(`attachment://${result.filename}`)
                .setTimestamp(),
        ],
        files: [{ attachment: result.filepath, name: result.filename }],
    };
}

async function buildFutureChartEmbed(ticker, hoursAgo, minutesAgo) {
    const key = `future_${ticker}_${hoursAgo}h_${minutesAgo}m`;
    const result = await getCachedChart(key, () =>
        generateStockChartImage(ticker, getFutureTimeRangeData([ticker], hoursAgo, minutesAgo), minutesAgo)
    );
    return {
        embeds: [
            new EmbedBuilder()
                .setTitle(':chart_with_upwards_trend:  실시간 선물 차트')
                .setImage(`attachment://${result.filename}`)
                .setTimestamp(),
        ],
        files: [{ attachment: result.filepath, name: result.filename }],
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

// ─── error embed ─────────────────────────────────────────────────────────────

function errorEmbed(msg) {
    return new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(msg).setTimestamp();
}

// ─── command definition ───────────────────────────────────────────────────────

module.exports = {
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
                        .setDescription('종목 코드 또는 이름')
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
                        .setDescription('종목 코드 또는 이름')
                        .setRequired(true)
                )
                .addIntegerOption((opt) => opt.setName('일').setDescription('기간 (일)').setMinValue(0).setRequired(false))
                .addIntegerOption((opt) => opt.setName('시간').setDescription('기간 (시간)').setMinValue(0).setRequired(false))
                .addIntegerOption((opt) => opt.setName('분').setDescription('기간 (분)').setMinValue(0).setRequired(false))
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const uid = uuidv4().replace(/-/g, '');

        // ── 자산 ──────────────────────────────────────────────────────────────
        if (subCommand === '자산') {
            const initial = await buildAssetEmbed(userId);
            if (!initial) {
                await interaction.reply({ embeds: [errorEmbed('자산 정보를 불러오지 못했습니다.')], ephemeral: true });
                return;
            }
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(userId, msg.channelId, msg.id, interaction.client, () => buildAssetEmbed(userId));

        // ── 주식목록 ──────────────────────────────────────────────────────────
        } else if (subCommand === '주식목록') {
            const sort = interaction.options.getString('정렬기준') ?? '가격순(높은)';
            const initial = buildStockListEmbed(sort);
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(userId, msg.channelId, msg.id, interaction.client, () => buildStockListEmbed(sort));

        // ── 선물목록 ──────────────────────────────────────────────────────────
        } else if (subCommand === '선물목록') {
            const sort = interaction.options.getString('정렬기준') ?? '가격순(높은)';
            const initial = buildFutureListEmbed(sort);
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(userId, msg.channelId, msg.id, interaction.client, () => buildFutureListEmbed(sort));

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
                await interaction.reply({ embeds: [errorEmbed('옵션 가격 정보를 불러오지 못했습니다.')], ephemeral: true });
                return;
            }
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(userId, msg.channelId, msg.id, interaction.client, () => buildOptionPriceEmbed(ticker));

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
            startSession(userId, msg.channelId, msg.id, interaction.client, () => buildIndexEmbed(indicator));

        // ── 순위 ──────────────────────────────────────────────────────────────
        } else if (subCommand === '순위') {
            const initial = await buildLeaderboardEmbed();
            if (!initial) {
                await interaction.reply({ embeds: [errorEmbed('순위 정보를 불러오지 못했습니다.')], ephemeral: true });
                return;
            }
            const stopRow = makeStopButton(userId, uid);
            await interaction.reply({ embeds: initial.embeds, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(userId, msg.channelId, msg.id, interaction.client, () => buildLeaderboardEmbed());

        // ── 주식차트 ──────────────────────────────────────────────────────────
        } else if (subCommand === '주식차트') {
            let ticker = interaction.options.getString('종목');
            ticker = tryGetTicker(ticker.trim());
            if (!ticker) {
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

            await interaction.deferReply();
            const initial = await buildStockChartEmbed(ticker, hoursAgo, minutes);
            const stopRow = makeStopButton(userId, uid);
            await interaction.editReply({ embeds: initial.embeds, files: initial.files, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(userId, msg.channelId, msg.id, interaction.client,
                () => buildStockChartEmbed(ticker, hoursAgo, minutes));

        // ── 선물차트 ──────────────────────────────────────────────────────────
        } else if (subCommand === '선물차트') {
            let ticker = interaction.options.getString('종목');
            ticker = tryGetTicker(ticker.trim());
            if (!ticker) {
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

            await interaction.deferReply();
            const initial = await buildFutureChartEmbed(ticker, hoursAgo, minutes);
            const stopRow = makeStopButton(userId, uid);
            await interaction.editReply({ embeds: initial.embeds, files: initial.files, components: [stopRow] });
            const msg = await interaction.fetchReply();
            startSession(userId, msg.channelId, msg.id, interaction.client,
                () => buildFutureChartEmbed(ticker, hoursAgo, minutes));
        }
    }
};
