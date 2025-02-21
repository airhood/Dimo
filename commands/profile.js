const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, getUser, getUserProfile, getLevelInfo } = require('../database');

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

        if (userExists === false) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('계정이 없습니다')
                        .setDescription('가입된 계정이 없습니다.\n회원가입은 **/회원가입** 을 통해 가능합니다.')
                ],
            });
            return;
        }

        const levelInfo = await getLevelInfo(targetUser.id);
        const avatarURL = targetUser.displayAvatarURL({ format: 'png', size: 512 });

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x9E754F)
                    .setTitle(`${targetUser.username}님의 프로필`)
                    .addFields(
                        { name: '레벨', value: `${levelInfo.level}레벨 (${levelInfo.state}/${levelInfo.target})` },
                    )
                    .setThumbnail(avatarURL)
            ],
        });
    }
}