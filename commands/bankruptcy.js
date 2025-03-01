const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserAsset, resetAsset, addAchievements } = require('../database');
const { serverLog } = require('../server/server_logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('파산신청')
        .setDescription('막대한 빚이 생긴 경우 파산으로부터 구제합니다.'),
    
    async execute(interaction) {
        const user = await getUserAsset(interaction.user.id);

        if (user.state === 'error') {
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

        let loanTotal = 0;
        user.data.asset.loans.forEach((loan) => {
            loanTotal += loan.amount;
        });

        if (user.data.asset.balance >= loanTotal) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x: 파산신청 거절')
                        .setDescription('파산 상태가 아닙니다.\n\n**파산신청**\n```조건: 주식, 선물, 옵션, 바이너리 옵션, 예금, 적금 등 대출을 제외한 모든 금융상품을 소유하지 않은 상태이어야 합니다.\n불이익: 프로필에 파산한 횟수가 표시됩니다.```')
                ],
            });
            return;
        } else {
            if ((user.data.asset.stocks.length !== 0) ||
                (user.data.asset.stockShortSales.length !== 0) ||
                (user.data.asset.futures.length !== 0) ||
                (user.data.asset.options.length !== 0) ||
                (user.data.asset.binary_options.length !== 0) ||
                (user.data.asset.fixed_deposits.length !== 0) ||
                (user.data.asset.savings_accounts.length !== 0)) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x: 파산신청 거절')
                            .setDescription('파산 상태가 아닙니다.\n\n**파산신청**\n```조건: 주식, 선물, 옵션, 바이너리 옵션, 예금, 적금 등 대출을 제외한 모든 금융상품을 소유하지 않은 상태이어야 합니다.\n불이익: 프로필에 파산한 횟수가 표시됩니다.```')
                    ],
                });
                return;
            }
            const resetResult = await resetAsset(interaction.user.id);
            
            if (resetResult.state === 'success') {
                const achievementsAddResult = await addAchievements(interaction.user.id, '파산신청', '파산신청을 한 적이 있어요.');

                if (achievementsAddResult) {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x448FE6)
                                .setTitle(':white_check_mark:  파산신청 승인')
                                .setDescription(`파산신청이 승인되었습니다.`)
                        ],
                    });
                } else if (resetResult.state === 'error') {
                    serverLog(`[ERROR] Un-processed bankruptcy achievment. id: ${interaction.user.id}`);
                    
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
            } else {
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
        }
    }
}