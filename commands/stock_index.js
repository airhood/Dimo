const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDISDAQIndex } = require('../stock_system/stock_index_system');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('지수')
        .setDescription('주가 지수를 확인합니다.')
        .addStringOption((option) =>
            option.setName('지수명')
                .setDescription('불러올 지수의 이름')
                .addChoices(
                    { name: 'DISDAQ', value: 'DISDAQ' },
                )
        ),

    async execute(interaction) {
        const indicator = interaction.options.getString('지수명');

        switch (indicator) {
            case 'DISDAQ':
                const indicatorValue = getDISDAQIndex();
                const formatted = indicatorValue.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle(`[DISDAQ]`)
                            .setDescription(`\`\`\`${formatted}원\`\`\``)
                            .setTimestamp()
                    ],
                });
                break;
            default:
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('지수 불러오기 실패')
                            .setDescription(`존재하지 않는 지수입니다.`)
                    ],
                });
                return;
        }
    }
}
