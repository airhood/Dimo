const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { createCache, saveCache } = require('../utils/cache');
const { getPropertyMarket, getUserProperties, buyProperty, sellProperty, takePropertyMortgage, repayPropertyMortgage } = require('../database');
const { PROPERTY_REGIONS, PROPERTY_TYPES, PROPERTY_MORTGAGE_LTV, PROPERTY_MORTGAGE_INTEREST_RATE, PROPERTY_MORTGAGE_TERM_DAYS } = require('../setting');
const { calcCurrentValue } = require('../systems/real_estate_system');

const REGION_CHOICES = PROPERTY_REGIONS.map(r => ({ name: r, value: r }));
const TYPE_CHOICES = PROPERTY_TYPES.map(t => ({ name: t, value: t }));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('부동산')
        .setDescription('부동산을 매수하고 임대수익을 얻으세요.')
        .addSubcommand(sub =>
            sub.setName('목록')
                .setDescription('현재 매물 목록을 표시합니다.')
                .addStringOption(opt =>
                    opt.setName('지역')
                        .setDescription('필터할 지역')
                        .setRequired(false)
                        .addChoices(...REGION_CHOICES)
                )
                .addStringOption(opt =>
                    opt.setName('종류')
                        .setDescription('필터할 종류')
                        .setRequired(false)
                        .addChoices(...TYPE_CHOICES)
                )
        )
        .addSubcommand(sub =>
            sub.setName('보유')
                .setDescription('보유 중인 부동산 목록과 임대수익을 표시합니다.')
        )
        .addSubcommand(sub =>
            sub.setName('매수')
                .setDescription('매물 번호를 선택하여 부동산을 매수합니다.')
                .addIntegerOption(opt =>
                    opt.setName('번호')
                        .setDescription('매물 번호 (/부동산 목록으로 확인)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('매도')
                .setDescription('보유 부동산을 매도합니다.')
                .addIntegerOption(opt =>
                    opt.setName('번호')
                        .setDescription('보유 부동산 번호 (/부동산 보유로 확인)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('담보대출')
                .setDescription('보유 부동산을 담보로 대출합니다.')
                .addIntegerOption(opt =>
                    opt.setName('번호')
                        .setDescription('보유 부동산 번호')
                        .setMinValue(1)
                        .setRequired(true)
                )
                .addIntegerOption(opt =>
                    opt.setName('금액')
                        .setDescription('대출 금액 (원)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('상환')
                .setDescription('담보대출을 상환합니다.')
                .addIntegerOption(opt =>
                    opt.setName('번호')
                        .setDescription('보유 부동산 번호')
                        .setMinValue(1)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === '목록') {
            const region = interaction.options.getString('지역');
            const type = interaction.options.getString('종류');

            const result = await getPropertyMarket(region, type);
            if (result.state === 'error') {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription('매물 목록을 불러오는 중 오류가 발생했습니다.')
                    ],
                    ephemeral: true,
                });
            }

            const listings = result.data;
            if (listings.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle('🏠 부동산 매물 목록')
                            .setDescription('현재 매물이 없습니다.')
                    ],
                });
            }

            const ITEMS_PER_PAGE = 5;
            const pages = [];
            for (let i = 0; i < listings.length; i += ITEMS_PER_PAGE) {
                const chunk = listings.slice(i, i + ITEMS_PER_PAGE);
                pages.push(chunk.map((l, j) => {
                    const globalIdx = i + j + 1;
                    const until = new Date(l.listedUntil);
                    const untilStr = `${until.getMonth() + 1}/${until.getDate()}`;
                    return `**#${globalIdx}** ${l.name} (${l.size}평)\n가격: **${l.price.toLocaleString()}원** | 임대수익: **${l.rentalYield}%**/3일 | 만료: ${untilStr}`;
                }).join('\n\n'));
            }

            // 페이지 인덱스 배열과 실제 listings를 캐싱
            const uid = uuidv4().replace(/-/g, '');
            createCache(uid, 15);
            saveCache(uid, { pages, currentPage: 0, listings });

            const prevBtn = new ButtonBuilder()
                .setCustomId(`property_list_prev-${interaction.user.id}-${uid}`)
                .setLabel('이전')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            const nextBtn = new ButtonBuilder()
                .setCustomId(`property_list_next-${interaction.user.id}-${uid}`)
                .setLabel('다음')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pages.length <= 1);

            const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

            const filterText = [region, type].filter(Boolean).join(', ');

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle(`🏠 부동산 매물 목록${filterText ? ` [${filterText}]` : ''}`)
                        .setDescription(pages[0])
                        .setFooter({ text: `총 ${listings.length}개 매물` })
                        .setTimestamp()
                ],
                components: [row],
            });
        }

        if (sub === '보유') {
            const result = await getUserProperties(interaction.user.id);
            if (result.state === 'error') {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('서버 오류')
                            .setDescription('부동산 정보를 불러오는 중 오류가 발생했습니다.')
                    ],
                    ephemeral: true,
                });
            }

            const properties = result.data;
            if (properties.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x3498DB)
                            .setTitle('🏠 내 부동산')
                            .setDescription('보유 중인 부동산이 없습니다.')
                    ],
                });
            }

            const lines = properties.map((p, i) => {
                const currentValue = calcCurrentValue(p);
                const profitLoss = currentValue - p.purchasePrice;
                const plSign = profitLoss >= 0 ? '+' : '';
                const plPercent = ((profitLoss / p.purchasePrice) * 100).toFixed(2);
                const rentalPer3d = Math.round(currentValue * (p.rentalYield / 100));
                const mortgageText = (p.mortgage && p.mortgage.amount > 0)
                    ? `\n대출: ${p.mortgage.amount.toLocaleString()}원 (만기: ${new Date(p.mortgage.dueDate).toLocaleDateString('ko-KR')})`
                    : '';
                return `**#${i + 1}** ${p.name} (${p.size}평)\n매수가: ${p.purchasePrice.toLocaleString()}원 → 현재: **${currentValue.toLocaleString()}원** (${plSign}${profitLoss.toLocaleString()}원, ${plSign}${plPercent}%)\n임대수익: ${rentalPer3d.toLocaleString()}원/3일 (${p.rentalYield}%)${mortgageText}`;
            });

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle('🏠 내 부동산')
                        .setDescription(lines.join('\n\n'))
                        .setFooter({ text: `총 ${properties.length}개 보유` })
                        .setTimestamp()
                ],
            });
        }

        if (sub === '매수') {
            const listingNum = interaction.options.getInteger('번호');

            const marketResult = await getPropertyMarket(null, null);
            if (marketResult.state === 'error') {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription('매물 정보를 불러올 수 없습니다.')],
                    ephemeral: true,
                });
            }

            const listings = marketResult.data;
            const listing = listings[listingNum - 1];
            if (!listing) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('매물 없음').setDescription('해당 번호의 매물이 없습니다.')],
                    ephemeral: true,
                });
            }

            const uid = uuidv4().replace(/-/g, '');
            createCache(uid, 5);
            saveCache(uid, { propertyId: listing.propertyId });

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`property_buy_confirm-${interaction.user.id}-${uid}`)
                .setLabel('매수 확인')
                .setStyle(ButtonStyle.Success);
            const cancelBtn = new ButtonBuilder()
                .setCustomId(`property_buy_cancel-${interaction.user.id}-${uid}`)
                .setLabel('취소')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle('🏠 부동산 매수 확인')
                        .setDescription(`**${listing.name}** (${listing.size}평)을 매수하시겠습니까?`)
                        .addFields(
                            { name: '지역', value: listing.region, inline: true },
                            { name: '종류', value: listing.type, inline: true },
                            { name: '크기', value: `${listing.size}평`, inline: true },
                            { name: '매매가', value: `${listing.price.toLocaleString()}원`, inline: true },
                            { name: '임대수익률', value: `${listing.rentalYield}%/3일`, inline: true },
                            { name: '임대수익(3일)', value: `${Math.round(listing.price * listing.rentalYield / 100).toLocaleString()}원`, inline: true },
                        )
                        .setTimestamp()
                ],
                components: [row],
            });
        }

        if (sub === '매도') {
            const propertyNum = interaction.options.getInteger('번호');

            const propResult = await getUserProperties(interaction.user.id);
            if (propResult.state === 'error') {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription('부동산 정보를 불러올 수 없습니다.')],
                    ephemeral: true,
                });
            }

            const properties = propResult.data;
            const prop = properties[propertyNum - 1];
            if (!prop) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('부동산 없음').setDescription('해당 번호의 부동산이 없습니다.')],
                    ephemeral: true,
                });
            }

            if (prop.mortgage && prop.mortgage.amount > 0) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('매도 불가').setDescription('담보대출이 남아 있습니다. 상환 후 매도해주세요.')],
                    ephemeral: true,
                });
            }

            const uid = uuidv4().replace(/-/g, '');
            createCache(uid, 5);
            saveCache(uid, { propertyIndex: propertyNum });

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`property_sell_confirm-${interaction.user.id}-${uid}`)
                .setLabel('매도 확인')
                .setStyle(ButtonStyle.Danger);
            const cancelBtn = new ButtonBuilder()
                .setCustomId(`property_sell_cancel-${interaction.user.id}-${uid}`)
                .setLabel('취소')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle('🏠 부동산 매도 확인')
                        .setDescription(`**${prop.name}** (${prop.size}평)을 매도하시겠습니까?`)
                        .addFields(
                            { name: '매수가', value: `${prop.purchasePrice.toLocaleString()}원`, inline: true },
                            { name: '현재 시세', value: `${calcCurrentValue(prop).toLocaleString()}원`, inline: true },
                            { name: '손익', value: `${(calcCurrentValue(prop) - prop.purchasePrice) >= 0 ? '+' : ''}${(calcCurrentValue(prop) - prop.purchasePrice).toLocaleString()}원`, inline: true },
                        )
                        .setTimestamp()
                ],
                components: [row],
            });
        }

        if (sub === '담보대출') {
            const propertyNum = interaction.options.getInteger('번호');
            const amount = interaction.options.getInteger('금액');

            const propResult = await getUserProperties(interaction.user.id);
            if (propResult.state === 'error') {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription('부동산 정보를 불러올 수 없습니다.')],
                    ephemeral: true,
                });
            }

            const properties = propResult.data;
            const prop = properties[propertyNum - 1];
            if (!prop) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('부동산 없음').setDescription('해당 번호의 부동산이 없습니다.')],
                    ephemeral: true,
                });
            }

            const maxLoan = Math.floor(prop.purchasePrice * PROPERTY_MORTGAGE_LTV);
            if (amount > maxLoan) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('한도 초과').setDescription(`LTV 70% 기준 최대 대출 가능 금액: **${maxLoan.toLocaleString()}원**`)],
                    ephemeral: true,
                });
            }

            if (prop.mortgage && prop.mortgage.amount > 0) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('이미 대출 중').setDescription('해당 부동산에 이미 담보대출이 있습니다.')],
                    ephemeral: true,
                });
            }

            const uid = uuidv4().replace(/-/g, '');
            createCache(uid, 5);
            saveCache(uid, { propertyIndex: propertyNum, amount });

            const interestRate = PROPERTY_MORTGAGE_INTEREST_RATE * 100;
            const termDays = PROPERTY_MORTGAGE_TERM_DAYS;

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`property_mortgage_confirm-${interaction.user.id}-${uid}`)
                .setLabel('대출 확인')
                .setStyle(ButtonStyle.Success);
            const cancelBtn = new ButtonBuilder()
                .setCustomId(`property_mortgage_cancel-${interaction.user.id}-${uid}`)
                .setLabel('취소')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF39C12)
                        .setTitle('🏠 담보대출 확인')
                        .setDescription(`**${prop.name}**을 담보로 대출하시겠습니까?`)
                        .addFields(
                            { name: '대출 금액', value: `${amount.toLocaleString()}원`, inline: true },
                            { name: '이자율', value: `연 ${interestRate}%`, inline: true },
                            { name: '대출 기간', value: `${termDays}일`, inline: true },
                            { name: 'LTV 한도', value: `${maxLoan.toLocaleString()}원 (70%)`, inline: true },
                        )
                        .setTimestamp()
                ],
                components: [row],
            });
        }

        if (sub === '상환') {
            const propertyNum = interaction.options.getInteger('번호');

            const propResult = await getUserProperties(interaction.user.id);
            if (propResult.state === 'error') {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription('부동산 정보를 불러올 수 없습니다.')],
                    ephemeral: true,
                });
            }

            const properties = propResult.data;
            const prop = properties[propertyNum - 1];
            if (!prop) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('부동산 없음').setDescription('해당 번호의 부동산이 없습니다.')],
                    ephemeral: true,
                });
            }

            if (!prop.mortgage || !prop.mortgage.amount || prop.mortgage.amount <= 0) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('대출 없음').setDescription('해당 부동산에 담보대출이 없습니다.')],
                    ephemeral: true,
                });
            }

            const result = await repayPropertyMortgage(interaction.user.id, propertyNum);
            if (result.state === 'no_balance') {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('잔액 부족').setDescription(`상환에 필요한 잔액이 부족합니다. 필요 금액: **${prop.mortgage.amount.toLocaleString()}원**`)],
                    ephemeral: true,
                });
            }
            if (result.state === 'error') {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription('상환 중 오류가 발생했습니다.')],
                    ephemeral: true,
                });
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle('✅ 담보대출 상환 완료')
                        .setDescription(`**${prop.name}** 담보대출 **${result.data.repayAmount.toLocaleString()}원**을 상환했습니다.`)
                        .setTimestamp()
                ],
            });
        }
    },
};
