const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { addNotification, getNotifications, deleteNotification } = require('../database');

const TYPE_NAMES = {
    stock: '주식',
    future: '선물',
    call_option: '콜옵션',
    put_option: '풋옵션',
    fund: '펀드',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('알림')
        .setDescription('평가손익 알림을 관리합니다.')
        .addSubcommand((sub) =>
            sub.setName('설정')
                .setDescription('평가손익이 목표에 도달하면 DM으로 알려줍니다.')
                .addStringOption((opt) =>
                    opt.setName('종류')
                        .setDescription('상품의 종류')
                        .addChoices(
                            { name: '주식', value: 'stock' },
                            { name: '선물', value: 'future' },
                            { name: '콜옵션', value: 'call_option' },
                            { name: '풋옵션', value: 'put_option' },
                            { name: '펀드', value: 'fund' },
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
                        .setDescription('콜옵션/풋옵션 전용 행사가')
                        .setRequired(false)
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
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === '설정') {
            const type = interaction.options.getString('종류');
            const ticker = interaction.options.getString('종목');
            const targetPnL = interaction.options.getInteger('목표손익');
            const direction = interaction.options.getString('방향');
            const strikePrice = interaction.options.getInteger('행사가') ?? null;

            if ((type === 'call_option' || type === 'put_option') && strikePrice === null) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('행사가 필요')
                            .setDescription('콜옵션/풋옵션 알림은 **행사가**를 입력해야 합니다.'),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await addNotification(interaction.user.id, type, ticker, targetPnL, direction, strikePrice);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류')
                            .setDescription('알림 등록 중 오류가 발생했습니다.'),
                    ],
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
                        .setDescription(`**${typeName}** ${ticker}${strikePriceText}의 평가손익이 **${targetPnL.toLocaleString()}원 ${directionText}**이 되면 DM으로 알림을 보내드립니다.`)
                        .setFooter({ text: '알림은 조건에 도달하면 한 번만 발송 후 자동 삭제됩니다.' }),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } else if (subCommand === '목록') {
            const result = await getNotifications(interaction.user.id);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류')
                            .setDescription('알림 목록 조회 중 오류가 발생했습니다.'),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const notifications = result.data;
            if (notifications.length === 0) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('알림 목록')
                            .setDescription('등록된 알림이 없습니다.'),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            let listText = '';
            for (let i = 0; i < notifications.length; i++) {
                const n = notifications[i];
                const typeName = TYPE_NAMES[n.type] || n.type;
                const directionText = n.direction === 'above' ? '이상' : '이하';
                const strikePriceText = n.strikePrice != null ? ` (행사가: ${n.strikePrice.toLocaleString()}원)` : '';
                const nextCheck = new Date(n.nextCheckAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
                listText += `**${i + 1}.** [${typeName}] ${n.ticker}${strikePriceText} → ${n.targetPnL.toLocaleString()}원 ${directionText}\n`;
                listText += `　다음 확인: ${nextCheck}\n`;
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('알림 목록')
                        .setDescription(listText)
                        .setFooter({ text: `/알림 삭제 번호 로 삭제할 수 있습니다.` }),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } else if (subCommand === '삭제') {
            const num = interaction.options.getInteger('번호');

            const result = await deleteNotification(interaction.user.id, num);
            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('오류')
                            .setDescription('알림 삭제 중 오류가 발생했습니다.'),
                    ],
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
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('알림 삭제 완료')
                        .setDescription(`**${num}번** 알림이 삭제되었습니다.`),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    }
};
