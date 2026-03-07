const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAndMarkAttendance, increaseLevelPointBy } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('출석체크')
        .setDescription('하루에 한 번 출석 체크를 하고 경험치를 획득합니다.'),

    async execute(interaction) {
        const userId = interaction.user.id;

        const attendanceResult = await checkAndMarkAttendance(userId);
        if (attendanceResult.state === 'error') {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('서버 오류')
                        .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.')
                        .setTimestamp()
                ],
            });
            return;
        }

        if (attendanceResult.data.alreadyChecked) {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const remainMs = tomorrow.getTime() - now.getTime();
            const remainHours = Math.floor(remainMs / (1000 * 60 * 60));
            const remainMinutes = Math.floor((remainMs % (1000 * 60 * 60)) / (1000 * 60));

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('이미 출석했습니다')
                        .setDescription(`오늘 이미 출석 체크를 완료했습니다.\n다음 출석까지 **${remainHours}시간 ${remainMinutes}분** 남았습니다.`)
                ],
            });
            return;
        }

        const { streak, xpGained } = attendanceResult.data;

        const levelResult = await increaseLevelPointBy(userId, xpGained);
        if (levelResult.state === 'error') {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('서버 오류')
                        .setDescription('오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.')
                        .setTimestamp()
                ],
            });
            return;
        }

        const { level, state, target } = levelResult.data;

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ 출석 완료')
                    .setFields([
                        {
                            name: '🔥  연속 출석',
                            value: `**${streak}**일째`,
                        },
                        {
                            name: '⭐  획득 경험치',
                            value: `**+${xpGained} XP**`,
                        },
                        {
                            name: '📊  현재 레벨',
                            value: `Lv.${level} (${state} / ${target} XP)`,
                        },
                    ])
            ],
        });
    }
}
