const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { createCache, saveCache } = require('../cache');
const { getNoticeList } = require('../database');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('공지사항')
        .setDescription('공지사항을 불러옵니다.'),
    
    async execute(interaction) {
        const notices = await getNoticeList(5);

        if (notices.state === 'error') {
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

        if (notices.data === null) {        
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
        const cacheData = { pages: notices.data, currentPage: 0 };
        createCache(uid, 15);
        saveCache(uid, cacheData);

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

        const formattedDate = moment(notices.data[0].date).tz('Asia/Seoul').format('YYYY-MM-DD');
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                .setColor(0xE57E22)
                .setTitle(':loudspeaker:  공지사항')
                .setDescription(`# ${notices.data[0].title}\n${notices.data[0].content}\n\n-# ${formattedDate}`)
                .setTimestamp()
            ],
            components: [row],
            fetchReply: true
        });
    }
}