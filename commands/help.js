const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('도움말')
        .setDescription('도움말을 확인합니다.'),
    
    async execute(interaction) {
        const helpContent = `\`\`\`
내용
\`\`\``;
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('도움말')
                    .setDescription(helpContent)
            ],
        });
    }
}