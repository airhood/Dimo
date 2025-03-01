const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { checkUserExists } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('회원탈퇴')
        .setDescription('디모봇과 관련된 모든 정보를 삭제합니다.'),
    
    async execute(interaction) {
        const deleteAccount = new ButtonBuilder()
            .setCustomId(`delete_account-${interaction.user.id}`)
            .setLabel('회원탈퇴')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(deleteAccount);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xEA4144)
                    .setTitle('회원탈퇴')
                    .setDescription('회원탈퇴를 한 후 되돌릴 수 없습니다.')
            ],
            components: [row],
        });
    }
}