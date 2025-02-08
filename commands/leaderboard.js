const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('순위')
        .setDescription('자산 순위를 불러옵니다.'),
    
    async execute(interaction) {
        
    }
}