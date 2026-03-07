const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkUserExists, transfer, transferToFund } = require('../database');

const fmt = (n) => Math.round(n).toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('송금')
        .setDescription('돈을 송금합니다.')
        .addSubcommand((sub) =>
            sub.setName('유저')
                .setDescription('다른 유저에게 송금합니다.')
                .addUserOption((opt) =>
                    opt.setName('유저')
                        .setDescription('송금할 대상')
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt.setName('금액')
                        .setDescription('송금할 액수')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('계좌')
                .setDescription('특정 계좌로 송금합니다.')
                .addStringOption((opt) =>
                    opt.setName('계좌종류')
                        .setDescription('송금할 계좌 종류')
                        .addChoices(
                            { name: '펀드계좌', value: 'fund' },
                        )
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt.setName('이름')
                        .setDescription('계좌 이름 (예: 펀드 이름)')
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt.setName('금액')
                        .setDescription('송금할 액수')
                        .setMinValue(1)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();

        // ── /송금 유저 ────────────────────────────────────────────────────────
        if (subCommand === '유저') {
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
                            .setDescription(`<@${from.id}>의 계정이 현재 오류 발생으로 인해 거래가 정지되어 있습니다.\n공식 디스코드 서버 **디모랜드**에서 *거래 정지* 태그를 통해 문의해주세요.`)
                    ],
                });
            } else if (result.state === 'locked:to') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  송금 실패')
                            .setDescription(`<@${to.id}>의 계정이 현재 오류 발생으로 인해 거래가 정지되어 있습니다.\n공식 디스코드 서버 **디모랜드**에서 *거래 정지* 태그를 통해 문의해주세요.`)
                    ],
                });
            } else if (result.state === 'success') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  송금 완료')
                            .setDescription(`<@${from.id}> :arrow_right: <@${to.id}>\n\`${fmt(amount)}\`원이 송금되었습니다.`)
                    ],
                });
            } else if (result.state === 'no_balance') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  송금 실패')
                            .setDescription(`<@${from.id}> 잔액이 부족합니다.`)
                    ],
                });
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
            }

        // ── /송금 계좌 ────────────────────────────────────────────────────────
        } else if (subCommand === '계좌') {
            const accountType = interaction.options.getString('계좌종류');
            const name = interaction.options.getString('이름');
            const amount = interaction.options.getInteger('금액');

            if (accountType === 'fund') {
                const result = await transferToFund(interaction.user.id, name, amount);

                if (result.state === 'locked') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  송금 실패')
                                .setDescription(`<@${interaction.user.id}>의 계정이 현재 오류 발생으로 인해 거래가 정지되어 있습니다.\n공식 디스코드 서버 **디모랜드**에서 *거래 정지* 태그를 통해 문의해주세요.`)
                        ],
                    });
                } else if (result.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  송금 실패')
                                .setDescription(`**${name}** 펀드가 존재하지 않습니다.`)
                        ],
                    });
                } else if (result.state === 'no_balance') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  송금 실패')
                                .setDescription('잔액이 부족합니다.')
                        ],
                    });
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x448FE6)
                                .setTitle(':white_check_mark:  송금 완료')
                                .setDescription(`<@${interaction.user.id}> :arrow_right: **${name}** 펀드계좌\n\`${fmt(amount)}\`원이 송금되었습니다.`)
                        ],
                    });
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
                }
            }
        }
    }
};
