const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getTransactionLog } = require('../database');
const { MAX_TRANSACTION_LOG_LOOKUP } = require('../setting');
const { v4: uuidv4 } = require('uuid');
const { createCache, saveCache } = require('../cache');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('거래내역')
        .setDescription('거래내역을 확인합니다. 최대 100개까지만 확인할 수 있습니다.')
        .addBooleanOption((option) =>
            option.setName('보안모드')
                .setDescription('다른 사람이 거래내역을 보지 못하도록 숨김 메시지로 보냅니다.')
        ),

    async execute(interaction) {
        const hide_mode = interaction.options.getBoolean('보안모드');

        const result = await getTransactionLog(interaction.user.id, MAX_TRANSACTION_LOG_LOOKUP);

        if (result.state === 'error') {
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

        if (!result.data || result.data.length === 0) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(`거래 내역 [${interaction.user.username}]`)
                        .setDescription('거래 내역이 없습니다.')
                        .setTimestamp()
                ],
                flags: hide_mode ? MessageFlags.Ephemeral : undefined,
            });
            return;
        }

        const transaction_log_format = [];
        result.data.forEach((transaction_log) => {
            const time_format = moment(transaction_log.transactionDate).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
            transaction_log_format.push(`[${time_format}] ${transaction_log.logMessage}`);
        });

        const pages = [];
        const ITEMS_PER_PAGE = 5;
        for (let i = 0; i < transaction_log_format.length; i += ITEMS_PER_PAGE) {
            pages.push(transaction_log_format.slice(i, i + ITEMS_PER_PAGE));
        }

        const uid = uuidv4().replace(/-/g, '');
        const cacheData = { pages: pages, currentPage: 0 };
        createCache(uid, 15);
        saveCache(uid, cacheData);

        const previousPage = new ButtonBuilder()
            .setCustomId(`transaction_log_previous_page-${interaction.user.id}-${uid}`)
            .setLabel('이전')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);

        const nextPage = new ButtonBuilder()
            .setCustomId(`transaction_log_next_page-${interaction.user.id}-${uid}`)
            .setLabel('다음')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(pages.length <= 1);

        const row = new ActionRowBuilder()
            .addComponents(previousPage, nextPage);

        if (hide_mode) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`거래 내역 [${interaction.user.username}]`)
                        .setDescription(`${pages[0].join('\n')}`)
                        .setTimestamp()
                ],
                components: [row],
                fetchReply: true,
                flags: MessageFlags.Ephemeral,
            });
        }
        else {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`거래 내역 [${interaction.user.username}]`)
                        .setDescription(`${pages[0].join('\n')}`)
                        .setTimestamp()
                ],
                components: [row],
                fetchReply: true,
            });
        }
    }
}
