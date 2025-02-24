const { SlashCommandBuilder, EmbedBuilder, CommandInteractionOptionResolver } = require('discord.js');
const { loan, loanRepay, openFixedDeposit, openSavingsAccount } = require('../database');
const { getInterestRatePoint, getFixedDepositInterestRatePoint, getLoanInterestRatePoint, getSavingsAccountInterestRatePoint } = require('../stock_system/bank_manager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('은행')
        .setDescription('은행은 금융 기관 중 하나이다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('기준금리')
                .setDescription('기준금리는 변동될 수 있습니다.')
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('대출')
                .setDescription('은행에서 돈을 대출을 받습니다. 매달 이자가 상환되며 원금은 만기일에 상환됩니다.')
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('대출할 액수 (최소 10만원)')
                        .setMinValue(100000) // 10만원
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('상환일')
                        .setDescription('대출을 상환할 현재로부터의 시간 (단위: 일)')
                        .setMaxValue(7)
                        .setMinValue(1)
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option.setName('금리종류')
                        .setDescription('금리를 결정할 방법')
                        .setChoices(
                            { name: '고정금리', value: '고정금리' },
                            { name: '변동금리', value: '변동금리' },
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('상환')
                .setDescription('대출을 상환합니다. 하나의 대출은 한 번에 상환해야 합니다.')
                .addIntegerOption((option) =>
                    option.setName('대출번호')
                        .setDescription('상환할 대출의 번호 (1부터 시작 / **/자산** 을 통해 확인)')
                        .setMinValue(1)
                        .setRequired(true),
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('대출금리')
                .setDescription('대출금리(대출이자율)은 변동될 수 있습니다.')
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('예금')
                .setDescription('은행에 돈을 예금합니다.')
                .addStringOption((option) =>
                    option.setName('상품')
                        .setDescription('예금 상품')
                        .setChoices(
                            { name: '3일', value: '3' },
                            { name: '7일', value: '7' },
                            { name: '10일', value: '10' },
                            { name: '14일', value: '14' },
                        )
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('예금할 액수')
                        .setMinValue(1000000) // 100만원
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('적금')
                .setDescription('은행에 돈을 적금합니다.')
                .addStringOption((option) =>
                    option.setName('상품')
                        .setDescription('적금 상품')
                        .setChoices(
                            { name: '3일', value: '3' },
                            { name: '7일', value: '7' },
                            { name: '10일', value: '10' },
                            { name: '14일', value: '14' },
                        )
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('매달 납입할 액수')
                        .setMinValue(1000000) // 100만원
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('예금금리')
                .setDescription('예금금리는 변동될 수 있습니다.')
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('적금금리')
                .setDescription('적금금리는 변동될 수 있습니다.')
        ),
    
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        
        if (subCommand === '기준금리') {
            const interestRatePoint = getInterestRatePoint();

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('기준금리')
                        .setDescription(`\`\`\`${interestRatePoint}%\`\`\``)
                ],
            });
        } else if (subCommand === '대출') {
            const amount = interaction.options.getInteger('금액');
            const dueDateRel = interaction.options.getInteger('상환일');
            const interestType = interaction.options.getString('금리종류');

            const now = new Date();
            const dueDate = new Date();
            dueDate.setDate(now.getDate() + dueDateRel);

            const result = await loan(interaction.user.id, amount, dueDate, interestType);

            if (result) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle(':white_check_mark:  대출 승인')
                            .setDescription(`은행으로부터 ${amount.toLocaleString('ko-KR')}원을 대출했습니다.`)
                    ]
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
                return;
            }
        } else if (subCommand === '상환') {
            const loanNumber = interaction.options.getInteger('대출번호');

            const result = await loanRepay(interaction.user.id, loanNumber);

            if (result === null) {
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
            } else if (result === false) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  대출 상환 실패')
                            .setDescription(`잔액이 부족합니다.\n현재 이자를 포함하여 상환해야 할 금액은 \`${result.toLocaleString('ko-KR')}원\` 입니다.`)
                    ]
                });
            } else {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle(':white_check_mark:  상환 완료')
                            .setDescription(`대출받은 ${result.toLocaleString('ko-KR')}원을 상환했습니다.`)
                    ]
                });
            }
        } else if (subCommand === '대출금리') {
            const interestRatePoint = getLoanInterestRatePoint();

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('대출금리')
                        .setDescription(`\`\`\`${interestRatePoint}%\`\`\``)
                ],
            });
        } else if (subCommand === '예금') {
            const product = interaction.options.getString('상품');
            const amount = interaction.options.getInteger('금액');

            const result = await openFixedDeposit(interaction.user.id, amount, parseInt(product));

            if (result === true) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle(':white_check_mark:  예금 완료')
                            .setDescription(`은행에 ${amount.toLocaleString('ko-KR')}원이 예금되었습니다.`)
                    ]
                });
            } else if (result === null) {
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
                            .setTitle(':x:  예금 실패')
                            .setDescription(`잔액이 부족합니다.`)
                    ]
                });
            }
        } else if (subCommand === '적금') {
            const product = interaction.options.getString('상품');
            const amount = interaction.options.getInteger('금액');

            const result = await openSavingsAccount(interaction.user.id, amount, parseInt(product));

            if (result === true) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle(':white_check_mark:  적금 신청 완료')
                            .setDescription(`은행에 적금 신청이 완료되었습니다.\n매일 자정에 ${amount.toLocaleString('ko-KR')}원이 자동으로 적금 계좌로 송금됩니다.\n중간에 잔액 부족으로 송금을 실패하면 원금은 반환받되, 이자는 지급받지 못합니다.`)
                    ]
                });
            } else if (result === null) {
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
                            .setTitle(':x:  적금 신청 실패')
                            .setDescription(`잔액이 부족합니다.`)
                    ]
                });
            }
        } else if (subCommand === '예금금리') {
            const interestRatePoint = getFixedDepositInterestRatePoint();

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('예금금리')
                        .setDescription(`\`\`\`${interestRatePoint}%\`\`\``)
                ],
            });
        } else if (subCommand === '적금금리') {
            const interestRatePoint = getSavingsAccountInterestRatePoint();

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('적금금리')
                        .setDescription(`\`\`\`${interestRatePoint}%\`\`\``)
                ],
            });
        }
    }
}
