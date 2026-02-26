const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, getUserAsset, getUserPersonalAsset } = require('../database');
const { buildAssetFields } = require('../utils/asset_render');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('자산')
        .setDescription('자산을 표시합니다.')
        .addUserOption((opt) =>
            opt.setName('유저')
                .setDescription('자산을 확인할 유저')
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt.setName('상세정보')
                .setDescription('자산의 상세정보 표시 여부')
                .addChoices(
                    { name: '표시', value: '표시' },
                    { name: '숨기기', value: '숨기기' },
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('유저') ?? interaction.user;
        const loadDetails = interaction.options.getString('상세정보') === '표시';

        const userExists = await checkUserExists(targetUser.id);
        if (userExists.state === 'error') {
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
            });
            return;
        }
        if (userExists.data === false) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('존재하지 않는 계정입니다').setDescription(`<@${targetUser.id}>의 계정이 존재하지 않습니다.`)],
            });
            return;
        }

        let result;
        let embedTitle;

        if (targetUser.id === interaction.user.id) {
            result = await getUserAsset(targetUser.id);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
                return;
            }
            embedTitle = result.isFund
                ? `:bank:  자산 [${result.fundName} 펀드]`
                : `:bank:  자산 [${targetUser.username}]`;
        } else {
            result = await getUserPersonalAsset(targetUser.id);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
                return;
            }
            embedTitle = `:bank:  자산 [${targetUser.username}]`;
        }

        try {
            const { fields } = await buildAssetFields(result.data.asset, loadDetails);
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(embedTitle)
                        .addFields(fields)
                        .setTimestamp()
                ]
            });
        } catch (err) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
            });
        }
    }
};
