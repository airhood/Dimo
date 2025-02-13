const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('도움말')
        .setDescription('도움말을 확인합니다.')
}