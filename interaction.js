const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { createUser, deleteUser, getUserAsset } = require('./database');
const { loadCache, saveCache, deleteCache } = require('./utils/cache');
const { drawCard, handTotal, buildActionRow, buildInProgressEmbed, handleHandEnd, canSplitHand, resolveGame, resolveInsurance } = require('./systems/blackjack_system');
const moment = require('moment-timezone');
const AutoTrade = require('./schemas/auto_trade');
const { validateScript } = require('./systems/auto_trade_interpreter');

function addInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isModalSubmit()) {
            const customId = interaction.customId;

            if (customId.startsWith('auto_trade_register-')) {
                // Format: auto_trade_register-{userId}-{encodedAccountKey}
                const parts = customId.split('-');
                const userId = parts[1];
                const accountKey = decodeURIComponent(parts.slice(2).join('-'));

                if (interaction.user.id !== userId) return;

                const script = interaction.fields.getTextInputValue('script');

                // Validate script syntax
                const validation = validateScript(script);
                if (!validation.ok) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('스크립트 오류')
                                .setDescription(`스크립트 문법 오류가 있습니다:\n\`\`\`\n${validation.error}\n\`\`\``)
                                .setTimestamp()
                        ],
                        ephemeral: true,
                    });
                }

                try {
                    await AutoTrade.findOneAndUpdate(
                        { userId, accountKey },
                        {
                            userId,
                            accountKey,
                            script,
                            isRunning: false,
                            logs: [],
                            lastError: null,
                        },
                        { upsert: true, new: true }
                    );

                    const accountLabel = accountKey === '@self'
                        ? '개인 계정'
                        : `펀드: ${accountKey.replace('@fund_', '')}`;

                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle('자동매매 스크립트 등록 완료')
                                .setDescription(`**[${accountLabel}]** 스크립트가 등록되었습니다.\n\`/자동매매 실행\`으로 자동매매를 시작하세요.`)
                                .setTimestamp()
                        ],
                        ephemeral: true,
                    });
                } catch (err) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription('스크립트 저장 중 오류가 발생했습니다.')
                                .setTimestamp()
                        ],
                        ephemeral: true,
                    });
                }
            }

            return;
        }

        if (interaction.isButton()) {
            const customID = interaction.customId.split('-');

            const action = customID[0];
            const userID = customID[1];

            if (interaction.user.id !== userID) {
                return;
            }

            if (action === 'sign_up_accept') {
                const result = await createUser(interaction.user.id);
                if (result.state === 'success') {
                    await interaction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle('회원가입 완료')
                                .setDescription(`안녕하세요 <@${interaction.user.id}>님!`)
                        ],
                        components: []
                    });
                } else if (result.state === 'error') {
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
            } else if (action === 'sign_up_deny') {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xe74c3c)
                            .setTitle('회원가입 거부')
                            .setDescription('회원가입이 거부되었습니다. 회원가입을 위해서는 규칙을 동의해야 합니다.')
                    ],
                    components: []
                });
            } else if (action === 'delete_account') {
                console.log('delete_account interaction');
                const result = await deleteUser(interaction.user.id);
                if (result.state === 'success') {
                    await interaction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('회원탈퇴 처리되었습니다')
                        ],
                        components: []
                    })
                } else if (result.state === 'error') {
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
            } else if (action === 'stock_previous_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === 0) return;

                const pageToLoad = currentPage - 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`stock_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);
                            
                const nextPage = new ButtonBuilder()
                    .setCustomId(`stock_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);

                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);
                
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(':chart_with_upwards_trend:  주식 목록')
                        .setDescription(`${pages[pageToLoad].join('\n')}`)
                        .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                const newCache = { pages: pages, currentPage: pageToLoad };
                saveCache(uid, newCache);
            } else if (action === 'stock_next_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === (pages.length - 1)) return;

                const pageToLoad = currentPage + 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`stock_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);
                
                const nextPage = new ButtonBuilder()
                    .setCustomId(`stock_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);
                
                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);
                
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(':chart_with_upwards_trend:  주식 목록')
                        .setDescription(`${pages[pageToLoad].join('\n')}`)
                        .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                const newCache = { pages: pages, currentPage: pageToLoad };
                saveCache(uid, newCache);
            } else if (action === 'future_previous_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === 0) return;

                const pageToLoad = currentPage - 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`future_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);
                            
                const nextPage = new ButtonBuilder()
                    .setCustomId(`future_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);

                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);
                
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(':chart_with_upwards_trend:  선물 목록')
                        .setDescription(`${pages[pageToLoad].join('\n')}`)
                        .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                const newCache = { pages: pages, currentPage: pageToLoad };
                saveCache(uid, newCache);
            } else if (action === 'future_next_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === (pages.length - 1)) return;

                const pageToLoad = currentPage + 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`future_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);
                
                const nextPage = new ButtonBuilder()
                    .setCustomId(`future_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);
                
                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);
                
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(':chart_with_upwards_trend:  선물 목록')
                        .setDescription(`${pages[pageToLoad].join('\n')}`)
                        .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                const newCache = { pages: pages, currentPage: pageToLoad };
                saveCache(uid, newCache);
            } else if (action === 'notice_previous_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === 0) return;

                const pageToLoad = currentPage - 1;
                
                const nextPage = new ButtonBuilder()
                .setCustomId(`notice_next_page-${interaction.user.id}-${uid}`)
                .setLabel('이전')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pageToLoad === pages.length - 1);

                const previousPage = new ButtonBuilder()
                    .setCustomId(`notice_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);

                const row = new ActionRowBuilder()
                    .addComponents(nextPage, previousPage);
                
                const formattedDate = moment(pages[pageToLoad].date).tz('Asia/Seoul').format('YYYY-MM-DD');
                
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(':loudspeaker:  공지사항')
                        .setDescription(`# ${pages[pageToLoad].title}\n${pages[pageToLoad].content}\n\n-# ${formattedDate}`)
                        .setTimestamp()
                    ],
                    components: [row],
                });

                const newCache = { pages: pages, currentPage: pageToLoad };
                saveCache(uid, newCache);
            } else if (action === 'notice_next_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === (pages.length - 1)) return;

                const pageToLoad = currentPage + 1;

                const nextPage = new ButtonBuilder()
                .setCustomId(`notice_next_page-${interaction.user.id}-${uid}`)
                .setLabel('이전')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pageToLoad === pages.length - 1);
                
                const previousPage = new ButtonBuilder()
                    .setCustomId(`notice_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);
                
                const row = new ActionRowBuilder()
                    .addComponents(nextPage, previousPage);
                
                const formattedDate = moment(pages[pageToLoad].date).tz('Asia/Seoul').format('YYYY-MM-DD');

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(':loudspeaker:  공지사항')
                        .setDescription(`# ${pages[pageToLoad].title}\n${pages[pageToLoad].content}\n\n-# ${formattedDate}`)
                        .setTimestamp()
                    ],
                    components: [row],
                });

                const newCache = { pages: pages, currentPage: pageToLoad };
                saveCache(uid, newCache);
            } else if (action === 'fund_previous_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === 0) return;

                const pageToLoad = currentPage - 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`fund_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);

                const nextPage = new ButtonBuilder()
                    .setCustomId(`fund_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);

                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle(':bar_chart:  펀드 목록')
                            .setDescription(`${pages[pageToLoad].join('\n\n')}`)
                            .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                saveCache(uid, { pages, currentPage: pageToLoad });
            } else if (action === 'fund_next_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage } = cache;

                if (currentPage === pages.length - 1) return;

                const pageToLoad = currentPage + 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`fund_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);

                const nextPage = new ButtonBuilder()
                    .setCustomId(`fund_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);

                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle(':bar_chart:  펀드 목록')
                            .setDescription(`${pages[pageToLoad].join('\n\n')}`)
                            .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                saveCache(uid, { pages, currentPage: pageToLoad });
            } else if (action === 'transaction_log_previous_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage, accountTitle } = cache;

                if (currentPage === 0) return;

                const pageToLoad = currentPage - 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`transaction_log_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);

                const nextPage = new ButtonBuilder()
                    .setCustomId(`transaction_log_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);

                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`거래 내역 [${accountTitle ?? interaction.user.username}]`)
                            .setDescription(`${pages[pageToLoad].join('\n')}`)
                            .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                saveCache(uid, { pages, currentPage: pageToLoad, accountTitle });
            } else if (action === 'transaction_log_next_page') {
                const uid = customID[2];
                if (!uid) return;

                const cache = loadCache(uid);
                if (!cache) return;

                const { pages, currentPage, accountTitle } = cache;

                if (currentPage === pages.length - 1) return;

                const pageToLoad = currentPage + 1;

                const previousPage = new ButtonBuilder()
                    .setCustomId(`transaction_log_previous_page-${interaction.user.id}-${uid}`)
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === 0);

                const nextPage = new ButtonBuilder()
                    .setCustomId(`transaction_log_next_page-${interaction.user.id}-${uid}`)
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageToLoad === pages.length - 1);

                const row = new ActionRowBuilder()
                    .addComponents(previousPage, nextPage);

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`거래 내역 [${accountTitle ?? interaction.user.username}]`)
                            .setDescription(`${pages[pageToLoad].join('\n')}`)
                            .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                saveCache(uid, { pages, currentPage: pageToLoad, accountTitle });
            } else if (action === 'bj_insure') {
                const game = loadCache(`bj_${userID}`);
                if (!game || game.resolved) {
                    return interaction.reply({ content: '게임이 만료되었습니다.', ephemeral: true });
                }
                const insuranceBet = Math.floor(game.betAmount / 2);
                const userAsset = await getUserAsset(userID);
                if (userAsset.state === 'error' || userAsset.data.asset.balance < insuranceBet) {
                    return interaction.reply({ content: '보험 베팅에 필요한 잔액이 부족합니다.', ephemeral: true });
                }
                await resolveInsurance(userID, true, interaction);

            } else if (action === 'bj_insure_pass') {
                await resolveInsurance(userID, false, interaction);

            } else if (action === 'bj_hit') {
                const game = loadCache(`bj_${userID}`);
                if (!game || game.resolved) {
                    return interaction.reply({ content: '게임이 만료되었습니다.', ephemeral: true });
                }

                const hand = game.hands[game.activeHand];
                hand.cards.push(drawCard());
                hand.isFirstTurn = false;
                saveCache(`bj_${userID}`, game);

                const playerTotal = handTotal(hand.cards);
                if (playerTotal >= 21) {
                    await handleHandEnd(userID, game, interaction);
                } else {
                    const embed = buildInProgressEmbed(game);
                    const row = buildActionRow(userID, game);
                    await interaction.update({ embeds: [embed], components: [row] });
                }
            } else if (action === 'bj_stand') {
                const game = loadCache(`bj_${userID}`);
                if (!game || game.resolved) {
                    return interaction.reply({ content: '게임이 만료되었습니다.', ephemeral: true });
                }
                await handleHandEnd(userID, game, interaction);

            } else if (action === 'bj_double') {
                const game = loadCache(`bj_${userID}`);
                if (!game || game.resolved) {
                    return interaction.reply({ content: '더블다운은 첫 턴에만 가능합니다.', ephemeral: true });
                }

                const hand = game.hands[game.activeHand];
                if (!hand.isFirstTurn) {
                    return interaction.reply({ content: '더블다운은 첫 턴에만 가능합니다.', ephemeral: true });
                }

                const userAsset = await getUserAsset(userID);
                if (userAsset.state === 'error' || userAsset.data.asset.balance < game.betAmount * 2) {
                    return interaction.reply({ content: '더블다운에 필요한 잔액이 부족합니다.', ephemeral: true });
                }

                hand.cards.push(drawCard());
                hand.isFirstTurn = false;
                hand.isDoubled = true;
                saveCache(`bj_${userID}`, game);

                // 카드 1장 후 강제 Stand
                await handleHandEnd(userID, game, interaction);

            } else if (action === 'bj_split') {
                const game = loadCache(`bj_${userID}`);
                if (!game || game.resolved) {
                    return interaction.reply({ content: '게임이 만료되었습니다.', ephemeral: true });
                }

                const hand = game.hands[game.activeHand];
                if (!canSplitHand(hand, game.isSplit)) {
                    return interaction.reply({ content: '스플릿 조건이 충족되지 않았습니다.', ephemeral: true });
                }

                const splitAsset = await getUserAsset(userID);
                if (splitAsset.state === 'error' || splitAsset.data.asset.balance < game.betAmount * 2) {
                    return interaction.reply({ content: `스플릿을 하려면 추가 배팅금 **${game.betAmount.toLocaleString()}원** 이상이 있어야 합니다.`, ephemeral: true });
                }

                const [card1, card2] = hand.cards;
                const isAceSplit = card1.value === 'A';

                // 각 핸드에 카드 1장씩 추가
                const hand1 = { cards: [card1, drawCard()], isFirstTurn: !isAceSplit, done: isAceSplit, isDoubled: false };
                const hand2 = { cards: [card2, drawCard()], isFirstTurn: !isAceSplit, done: isAceSplit, isDoubled: false };

                game.hands[game.activeHand] = hand1;
                game.hands.push(hand2);
                game.activeHand = 0;
                game.isSplit = true;
                saveCache(`bj_${userID}`, game);

                if (isAceSplit) {
                    // 에이스 스플릿: 양 핸드 즉시 종료 → 바로 딜러 대결
                    await resolveGame(userID, game, interaction);
                } else {
                    const embed = buildInProgressEmbed(game);
                    const row = buildActionRow(userID, game);
                    await interaction.update({ embeds: [embed], components: [row] });
                }

            } else if (action === 'realtime_stop') {
                const uid = customID[2];
                const { stopSession } = require('./systems/realtime_manager');
                stopSession(uid);
                await interaction.update({ components: [] });
            }
        }
    });
}

exports.addInteractionHandler = addInteractionHandler;