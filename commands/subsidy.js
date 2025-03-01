const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addBalance, markSubsidyReceived, checkSubsidyReceived } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('지원금')
        .setDescription('하루에 한번 지원금을 받을 수 있습니다.'),
    
    async execute(interaction) {
        const subsidyReceived = await checkSubsidyReceived(interaction.user.id);
        if (subsidyReceived === null) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xEA4144)
                    .setTitle('오류가 발생했습니다')
                    .setDescription('공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.')
                ]
            });
            return;
        }
        else if (subsidyReceived === true) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('지원금 없음')
                        .setDescription(`오늘 이미 지원금을 수령했습니다.\n지원금은 하루에 한 번만 수령할 수 있습니다.`)
                ],
            });
            return;
        }

        const result1 = await addBalance(interaction.user.id, 50000);
        if (result1.state === 'error') {
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

        const result2 = await markSubsidyReceived(interaction.user.id, new Date());
        if (result2.state === 'error') {
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

        const fields = [
            {
                name: ':dollar:  계좌 잔액',
                value: `\`\`\`${result1.data.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}원\`\`\``,
            }
        ];

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle('지원금 도착')
                    .setDescription('지원금 5만원이 도착했습니다!')
                    .setFields(fields)
            ],
        });
    }
}