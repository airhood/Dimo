const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { addNotification, getNotifications, deleteNotification } = require('../database');

const TYPE_NAMES = {
    stock: '주식',
    future: '선물',
    option: '옵션',
    binary_option: '바이너리 옵션',
    fund: '펀드',
    etf: 'ETF',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('알림')
        .setDescription('평가손익 알림을 관리합니다.')
        .addSubcommandGroup((group) =>
            group.setName('설정')
                .setDescription('알림을 설정합니다.')
                .addSubcommand((sub) =>
                    sub.setName('포지션')
                        .setDescription('특정 포지션의 평가손익에 따라 알림을 받습니다.')
                        .addStringOption((opt) =>
                            opt.setName('종류')
                                .setDescription('상품의 종류')
                                .addChoices(
                                    { name: '주식', value: 'stock' },
                                    { name: '선물', value: 'future' },
                                    { name: '옵션', value: 'option' },
                                    { name: '바이너리 옵션', value: 'binary_option' },
                                    { name: 'ETF', value: 'etf' },
                                )
                                .setRequired(true)
                        )
                        .addIntegerOption((opt) =>
                            opt.setName('포지션번호')
                                .setDescription('알림을 받을 포지션의 번호 (/자산에서 확인)')
                                .setMinValue(1)
                                .setRequired(true)
                        )
                        .addIntegerOption((opt) =>
                            opt.setName('목표손익')
                                .setDescription('이 손익(원)에 도달하면 알림을 받습니다. 음수 가능')
                                .setRequired(true)
                        )
                        .addStringOption((opt) =>
                            opt.setName('방향')
                                .setDescription('목표손익 이상/이하')
                                .addChoices(
                                    { name: '이상 (목표손익 ≥ 설정값)', value: 'above' },
                                    { name: '이하 (목표손익 ≤ 설정값)', value: 'below' },
                                )
                                .setRequired(true)
                        )
                )
                .addSubcommand((sub) =>
                    sub.setName('종목')
                        .setDescription('투자한 종목의 합산 평가손익에 따라 알림을 받습니다.')
                        .addStringOption((opt) =>
                            opt.setName('종류')
                                .setDescription('상품의 종류')
                                .addChoices(
                                    { name: '주식', value: 'stock' },
                                    { name: '선물', value: 'future' },
                                    { name: '옵션', value: 'option' },
                                    { name: '바이너리 옵션', value: 'binary_option' },
                                    { name: '펀드', value: 'fund' },
                                    { name: 'ETF', value: 'etf' },
                                )
                                .setRequired(true)
                        )
                        .addStringOption((opt) =>
                            opt.setName('종목')
                                .setDescription('종목 코드 또는 펀드 이름')
                                .setRequired(true)
                        )
                        .addIntegerOption((opt) =>
                            opt.setName('목표손익')
                                .setDescription('이 손익(원)에 도달하면 알림을 받습니다. 음수 가능')
                                .setRequired(true)
                        )
                        .addStringOption((opt) =>
                            opt.setName('방향')
                                .setDescription('목표손익 이상/이하')
                                .addChoices(
                                    { name: '이상 (목표손익 ≥ 설정값)', value: 'above' },
                                    { name: '이하 (목표손익 ≤ 설정값)', value: 'below' },
                                )
                                .setRequired(true)
                        )
                        .addIntegerOption((opt) =>
                            opt.setName('행사가')
                                .setDescription('옵션 전용: 특정 행사가만 필터링 (미입력 시 전체 합산)')
                                .setRequired(false)
                        )
                )
                .addSubcommand((sub) =>
                    sub.setName('계좌')
                        .setDescription('전체 계좌의 합산 평가손익에 따라 알림을 받습니다.')
                        .addIntegerOption((opt) =>
                            opt.setName('목표손익')
                                .setDescription('이 손익(원)에 도달하면 알림을 받습니다. 음수 가능')
                                .setRequired(true)
                        )
                        .addStringOption((opt) =>
                            opt.setName('방향')
                                .setDescription('목표손익 이상/이하')
                                .addChoices(
                                    { name: '이상 (목표손익 ≥ 설정값)', value: 'above' },
                                    { name: '이하 (목표손익 ≤ 설정값)', value: 'below' },
                                )
                                .setRequired(true)
                        )
                )
        )
        .addSubcommand((sub) =>
            sub.setName('목록')
                .setDescription('등록된 알림 목록을 확인합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('삭제')
                .setDescription('알림을 삭제합니다.')
                .addIntegerOption((opt) =>
                    opt.setName('번호')
                        .setDescription('삭제할 알림 번호 (/알림 목록에서 확인)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subCommandGroup = interaction.options.getSubcommandGroup(false);
        const subCommand = interaction.options.getSubcommand();

        // ── /알림 설정 ──────────────────────────────────────────────────────────
        if (subCommandGroup === '설정') {
            const targetPnL = interaction.options.getInteger('목표손익');
            const direction = interaction.options.getString('방향');

            let result;

            if (subCommand === '포지션') {
                const type = interaction.options.getString('종류');
                const positionNum = interaction.options.getInteger('포지션번호');

                result = await addNotification(
                    interaction.user.id,
                    'position',
                    targetPnL,
                    direction,
                    { type, positionNum }
                );

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription('알림 등록 중 오류가 발생했습니다.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const typeName = TYPE_NAMES[type] || type;
                const directionText = direction === 'above' ? '이상' : '이하';

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('알림 등록 완료')
                            .setDescription(`**${typeName}** 포지션 #${positionNum}의 평가손익이 **${targetPnL.toLocaleString()}원 ${directionText}**이 되면 DM으로 알림을 보내드립니다.`)
                            .setFooter({ text: '알림은 조건에 도달하면 한 번만 발송 후 자동 삭제됩니다.' }),
                    ],
                    flags: MessageFlags.Ephemeral,
                });

            } else if (subCommand === '종목') {
                const type = interaction.options.getString('종류');
                const ticker = interaction.options.getString('종목');
                const strikePrice = interaction.options.getInteger('행사가') ?? null;

                result = await addNotification(
                    interaction.user.id,
                    'ticker',
                    targetPnL,
                    direction,
                    { type, ticker, strikePrice: strikePrice ?? undefined }
                );

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription('알림 등록 중 오류가 발생했습니다.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const typeName = TYPE_NAMES[type] || type;
                const directionText = direction === 'above' ? '이상' : '이하';
                const strikePriceText = strikePrice !== null ? ` (행사가: ${strikePrice.toLocaleString()}원)` : '';

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('알림 등록 완료')
                            .setDescription(`**${typeName}** ${ticker}${strikePriceText}의 합산 평가손익이 **${targetPnL.toLocaleString()}원 ${directionText}**이 되면 DM으로 알림을 보내드립니다.`)
                            .setFooter({ text: '알림은 조건에 도달하면 한 번만 발송 후 자동 삭제됩니다.' }),
                    ],
                    flags: MessageFlags.Ephemeral,
                });

            } else if (subCommand === '계좌') {
                result = await addNotification(
                    interaction.user.id,
                    'account',
                    targetPnL,
                    direction,
                    {}
                );

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription('알림 등록 중 오류가 발생했습니다.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const directionText = direction === 'above' ? '이상' : '이하';

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('알림 등록 완료')
                            .setDescription(`전체 계좌의 합산 평가손익이 **${targetPnL.toLocaleString()}원 ${directionText}**이 되면 DM으로 알림을 보내드립니다.`)
                            .setFooter({ text: '알림은 조건에 도달하면 한 번만 발송 후 자동 삭제됩니다.' }),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            return;
        }

        // ── /알림 목록 ──────────────────────────────────────────────────────────
        if (subCommand === '목록') {
            const result = await getNotifications(interaction.user.id);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription('알림 목록 조회 중 오류가 발생했습니다.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const notifications = result.data;
            if (notifications.length === 0) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('알림 목록').setDescription('등록된 알림이 없습니다.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            let listText = '';
            for (let i = 0; i < notifications.length; i++) {
                const n = notifications[i];
                const directionText = n.direction === 'above' ? '이상' : '이하';
                const nextCheck = new Date(n.nextCheckAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

                let subjectText;
                if (n.alertScope === 'position') {
                    const typeName = TYPE_NAMES[n.type] || n.type;
                    subjectText = `[포지션] ${typeName} #${n.positionNum}`;
                } else if (n.alertScope === 'ticker') {
                    const typeName = TYPE_NAMES[n.type] || n.type;
                    const strikePriceText = n.strikePrice != null ? ` (행사가: ${n.strikePrice.toLocaleString()}원)` : '';
                    subjectText = `[종목] ${typeName} ${n.ticker}${strikePriceText}`;
                } else {
                    subjectText = '[계좌] 전체 평가손익';
                }

                if (i > 0) listText += '\n';
                listText += `${i + 1}. ${subjectText}\n`;
                listText += `   목표: ${n.targetPnL.toLocaleString()}원 ${directionText}\n`;
                listText += `   확인: ${nextCheck}`;
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('알림 목록')
                        .setDescription(`\`\`\`${listText}\`\`\``)
                        .setFooter({ text: '/알림 삭제 번호 로 삭제할 수 있습니다.' }),
                ],
                flags: MessageFlags.Ephemeral,
            });

        // ── /알림 삭제 ──────────────────────────────────────────────────────────
        } else if (subCommand === '삭제') {
            const num = interaction.options.getInteger('번호');

            const result = await deleteNotification(interaction.user.id, num);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('오류').setDescription('알림 삭제 중 오류가 발생했습니다.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            if (result.state === 'invalid_num') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('잘못된 번호')
                            .setDescription(`**${num}번** 알림이 존재하지 않습니다.\n**/알림 목록**으로 번호를 확인해주세요.`),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('알림 삭제 완료').setDescription(`**${num}번** 알림이 삭제되었습니다.`)],
                flags: MessageFlags.Ephemeral,
            });
        }
    }
};
