const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAllUserAsset } = require('../database');
const { calculateAssetValue } = require('../stock_system/credit_system');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('순위')
        .setDescription('자산 순위를 가져옵니다. 순위는 1시간마다 업데이트됩니다.'),

    async execute(interaction) {
        const result = await getAllUserAsset();

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

        if (result.data === null) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xE57E22)
                        .setTitle(':trophy:  자산 순위')
                        .setDescription('등록된 유저가 없습니다.')
                        .setTimestamp()
                ],
            });
            return;
        }

        const ranked = result.data
            .map(user => ({
                userID: user.userID,
                assetValue: calculateAssetValue(user.asset),
            }))
            .sort((a, b) => b.assetValue - a.assetValue)
            .slice(0, 10);

        const medals = [':first_place:', ':second_place:', ':third_place:'];

        const lines = ranked.map((user, i) => {
            const medal = medals[i] ?? `**${i + 1}.**`;
            const formatted = user.assetValue.toFixed(0).replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');
            return `${medal} <@${user.userID}> — \`${formatted}원\``;
        });

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle(':trophy:  자산 순위 TOP 10')
                    .setDescription(lines.join('\n'))
                    .setTimestamp()
            ],
        });
    }
}
