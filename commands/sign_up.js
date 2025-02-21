const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { checkUserExists, checkUserBanned } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('회원가입')
        .setDescription('디모봇에 프로필을 생성합니다.'),
    
    async execute(interaction) {
        const userBanned = await checkUserBanned(interaction.user.id);

        if (userBanned === false) {
            const userExists = await checkUserExists(interaction.user.id);
    
            if (userExists === true) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('이미 계정이 존재합니다')
                    ],
                });
            } else if (userExists === false) {
                const accept = new ButtonBuilder()
                    .setCustomId(`sign_up_accept-${interaction.user.id}`)
                    .setLabel('동의')
                    .setStyle(ButtonStyle.Success);
    
                const deny = new ButtonBuilder()
                    .setCustomId(`sign_up_deny-${interaction.user.id}`)
                    .setLabel('거부')
                    .setStyle(ButtonStyle.Danger);
                
                const row = new ActionRowBuilder()
                    .addComponents(accept, deny);
    
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x95A5A6)
                            .setTitle('Dimo 사용 규칙')
                            .setDescription('1. 매크로 등 자동화 프로그램을 이용할 경우 이용이 제한될 수 있습니다.')
                    ],
                    components: [row]
                });
            }
        } else if (userBanned === null) {
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
        } else {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('아이디가 영구밴 되어 회원가입이 거부되었습니다')
                        .setDescription(`**아이디:** ${userBanned.userID}\n**사유:** ${userBanned.details}`)
                ],
            });
        }

    }
}