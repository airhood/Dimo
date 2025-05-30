const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, transfer } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('송금')
        .setDescription('돈을 다른 사람에게 송금합니다.')
        .addUserOption((option) =>
            option.setName('유저')
                .setDescription('송금할 대상')
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName('금액')
                .setDescription('송금할 액수')
                .setMinValue(1)
                .setRequired(true)
        ),
    
    async execute(interaction) {
        const from = interaction.user;
        const to = interaction.options.getUser('유저');
        const amount = interaction.options.getInteger('금액');

        if (from.id === to.id) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x: 송금 실패')
                        .setDescription('자기 자신에게 송금할 수 없습니다.')
                ],
            });
            return;
        }

        const toUserExists = await checkUserExists(to.id);
        if (toUserExists.state === 'error') {
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

        if (toUserExists.data === false) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('존재하지 않는 계정입니다')
                        .setDescription(`<@${to.id}>의 계정이 존재하지 않습니다.`)
                ],
            });
            return;
        }

        const result = await transfer(from.id, to.id, amount);

        if (result.state === 'locked:from') {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x:  송금 실패')
                        .setDescription(`<@${from.id}>의 계정이 현재 오류 발생으로 인해 거래가 정지되어 있습니다.
                            공식 디스코드 서버 **디모랜드**에서 *거래 정지* 태그를 통해 문의해주세요.`)
                ],
            });
        }
        else if (result.state === 'locked:to') {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x:  송금 실패')
                        .setDescription(`<@${to.id}>의 계정이 현재 오류 발생으로 인해 거래가 정지되어 있습니다.
                            공식 디스코드 서버 **디모랜드**에서 *거래 정지* 태그를 통해 문의해주세요.`)
                ],
            });
        }
        else if (result.state === 'success') {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x448FE6)
                        .setTitle(':white_check_mark:  송금 완료')
                        .setDescription(`<@${from.id}> :arrow_right: <@${to.id}>
                             \`${amount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}\`원이 송금되었습니다.`)
                ],
            });
        }
        else if (result.state === 'no_balance') {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle(':x:  송금 실패')
                        .setDescription(`<@${from.id}> 잔액이 부족합니다.`)
                ],
            });
        }
        else if (result.state === 'error') {
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