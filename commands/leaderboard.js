const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('순위')
        .setDescription('자산 순위를 가져옵니다. 순위는 1시간마다 업데이트됩니다.'),
    
    async execute(interaction) {
        
    }
}