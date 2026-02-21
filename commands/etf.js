const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('etf')
        .setDescription('ETF (상장지수펀드) 관련 명령어입니다.'),
    async execute(interaction) {
        await interaction.reply({ content: '준비 중입니다.', ephemeral: true });
    }
};
