const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCurrentHourNews } = require('../stock_system/news_system');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('뉴스')
        .setDescription('뉴스를 불러옵니다.'),

    async execute(interaction) {
        const newsData = getCurrentHourNews();

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle('디모뉴스')
                    .setDescription(`\`\`\`${newsData.join('\n')}\`\`\``)
            ],
        });
    }
}
