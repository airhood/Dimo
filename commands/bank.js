const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('은행')
        .setDescription('은행은 금융 기관 중 하나이다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('대출')
                .setDescription('은행에서 돈을 대출을 받습니다. 매달 이자가 상환되며 원금은 만기일에 상환됩니다.')
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('대출할 액수')
                        .setMinValue(1000000) // 100만원
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

        if (subCommand === '대출') {

        }
        else if (subCommand === '대출금리') {
            
        }
        else if (subCommand === '예금') {

        }
        else if (subCommand === '적금') {

        }
        else if (subCommand === '예금금리') {

        }
        else if (subCommand === '적금금리') {

        }
    }
}
