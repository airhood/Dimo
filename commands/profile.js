const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, getLevelInfo, getUserProfile } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('프로필')
        .setDescription('사용자의 프로필을 표시합니다.')
        .addUserOption((option) =>
            option.setName('유저')
                .setDescription('프로필을 확인할 유저')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        let targetUser = interaction.options.getUser('유저');
        
        if (targetUser === null) {
            targetUser = interaction.user;
        }

        const userExists = await checkUserExists(targetUser.id);
        if (userExists.state === 'error') {
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

        if (userExists.data === false) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('존재하지 않는 계정입니다')
                        .setDescription(`<@${targetUser.id}>의 계정이 존재하지 않습니다.`)
                ],
            });
            return;
        }

        const levelInfo = await getLevelInfo(targetUser.id);
        if (levelInfo.state === 'error') {
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

        const userProfile = await getUserProfile(targetUser.id);
        if (userProfile.state === 'error') {
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

        const avatarURL = targetUser.displayAvatarURL({ format: 'png', size: 512 });

        const achievements = {};
        userProfile.data.profile.achievements.forEach((achievement) => {
            if (achievements[achievement.name]) {
                achievements[achievement.name].amount++;
            } else {
                achievements[achievement.name] = {
                    achievement: achievement,
                    amount: 1,
                };
            }
        });

        const achievementsContent = [];
        for (const [name, achievement_obj] of Object.entries(achievements)) {
            if (achievement_obj.amount === 1) {
                achievementsContent.push(`**${achievement_obj.achievement.name}**\n${achievement_obj.achievement.description}`);
            } else {
                achievementsContent.push(`**${achievement_obj.achievement.name}** x${achievement_obj.amount}\n${achievement_obj.achievement.description}`);
            }
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x9E754F)
                    .setTitle(`${targetUser.username}님의 프로필`)
                    .addFields(
                        { name: ':sparkles: 레벨', value: `${levelInfo.data.level}레벨 (${levelInfo.data.state}/${levelInfo.data.target})` },
                        { name: ':diamond_shape_with_a_dot_inside: 업적', value: achievementsContent.join('\n') },
                    )
                    .setThumbnail(avatarURL)
            ],
        });
    }
}