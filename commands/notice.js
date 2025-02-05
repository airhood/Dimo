const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { createCache, saveCache } = require('../cache');
const { checkUserExists, getNoticeList } = require('../database');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('공지사항')
        .setDescription('공지사항을 불러옵니다.'),
    
    async execute(interaction) {
        const notices = await getNoticeList(5);

        if (notices === null) {        
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(':loudspeaker:  공지사항')
                        .setDescription(`공지사항이 없습니다.`)
                        .setTimestamp()
                ],
            });

            return;
        }
        
        const uid = uuidv4().replace(/-/g, '');
        const cacheData = { pages: notices, currentPage: 0 };
        createCache(uid, 15);
        saveCache(uid, cacheData);

        const previousPage = new ButtonBuilder()
            .setCustomId(`notice_previous_page-${interaction.user.id}-${uid}`)
            .setLabel('이전')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);
        
        const nextPage = new ButtonBuilder()
            .setCustomId(`notice_next_page-${interaction.user.id}-${uid}`)
            .setLabel('다음')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!(notices.length > 1));
            
        const row = new ActionRowBuilder()
            .addComponents(previousPage, nextPage);

        const formattedDate = moment(notices[0].date).tz('Asia/Seoul').format('YYYY-MM-DD');
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                .setColor(0xE57E22)
                .setTitle(':loudspeaker:  공지사항')
                .setDescription(`# ${notices[0].title}\n${notices[0].content}\n\n-# ${formattedDate}`)
                .setTimestamp()
            ],
            components: [row],
            fetchReply: true
        });
    }
}