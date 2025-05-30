const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { createUser, deleteUser } = require('./database');
const { loadCache, saveCache } = require('./cache');
const moment = require('moment-timezone');

function addInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {
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
                
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(':loudspeaker:  공지사항')
                        .setDescription(`# ${pages[pageToLoad].title}\n${pages[pageToLoad].content}\n\n-# ${formattedDate}`)
                        .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
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

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(':loudspeaker:  공지사항')
                        .setDescription(`# ${pages[pageToLoad].title}\n${pages[pageToLoad].content}\n\n-# ${formattedDate}`)
                        .setTimestamp()
                    ],
                    components: [row],
                    fetchReply: true
                });

                const newCache = { pages: pages, currentPage: pageToLoad };
                saveCache(uid, newCache);
            }
        }
    });
}

exports.addInteractionHandler = addInteractionHandler;