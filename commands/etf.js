const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('etf')
        .setDescription('ETF (준비 중)'),

    async execute(interaction) {
        // 미구현
    }
}
