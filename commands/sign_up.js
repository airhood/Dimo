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
                            .setTitle('서비스 이용약관 및 개인정보처리방침')
                            .setDescription('**\'동의\'** 버튼을 누를 시 아래 약관에 동의한 것으로 간주합니다.\n약관 동의를 거절할 권리가 있지만, 약관에 동의하지 않을 시 서비스 이용이 제한될 수 있습니다.\n\n**서비스 이용약관**\nhttps://dimo-bot.notion.site/Terms-of-Service-189513f1951b803da711d8401f4e219e\n**개인정보처리방침**\nhttps://dimo-bot.notion.site/Privacy-Policy-189513f1951b80f19728d0bf96fb79ee')
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