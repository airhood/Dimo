const { SlashCommandBuilder } = require('discord.js');
const { getUserAsset, resetAsset, addAchievements } = require('../database');
const { serverLog } = require('../server/server_logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('파산신청')
        .setDescription('막대한 빚이 생긴 경우 파산으로부터 구제합니다.'),
    
    async execute(interaction) {
        const user = await getUserAsset(interaction.user.id);

        if (user.asset.balance >= 0) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x: 파산신청 거절')
                        .setDescription('파산 상태가 아닙니다.\n\n**파산신청**\n```조건: 주식, 선물, 옵션, 바이너리 옵션, 예금, 적금 등 대출을 제외한 모든 금융상품을 소유하지 않은 상태이어야 합니다.\ㅜ불이익: 프로필에 파산한 횟수가 표시됩니다.```')
                ],
            });
            return;
        } else {
            const resetResult = await resetAsset(interaction.user.id);
            
            if (resetResult) {
                const achievementsAddResult = await addAchievements(interaction.user.id, '파산신청', '파산신청을 한 적이 있어요.');

                if (achievementsAddResult) {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x448FE6)
                                .setTitle(':white_check_mark:  파산신청 승인')
                                .setDescription(`<@${from.id}> :arrow_right: <@${to.id}>
                                        \`${amount}\`원이 송금되었습니다.`)
                        ],
                    });
                } else {
                    serverLog(`[ERROR] Un-processed bankruptcy achievment. id: ${interaction.user.id}`);
                    
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('오류가 발생했습니다')
                                .setDescription('디모봇 관리자(airhood_dev)에게 문의해주세요.')
                        ]
                    });
                }
            } else {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류가 발생했습니다')
                            .setDescription('디모봇 관리자(airhood_dev)에게 문의해주세요.')
                    ]
                });
            }
        }
    }
}