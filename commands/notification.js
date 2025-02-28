const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('알림')
        .setDescription('알림을 받습니다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('포지션')
                .setDescription('포지션의 평가손익에 따라 알림을 받습니다.')
                .addStringOption((option) =>
                    option.setName('종류')
                        .setDescription('상품의 종류')
                        .addChoices(
                            { name: '주식', value: 'stock' },
                            { name: '선물', value: 'future' },
                            { name: '옵션', value: 'option' },
                            { name: '바이너리 옵션', value: 'binary_option' },
                        )
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('포지션번호')
                        .setDescription('알림을 받을 포지션의 번호')
                        .setMinValue(1)
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('평가손익')
                        .setDescription('알림을 받을 평가손익')
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('종목')
                .setDescription('투자한 종목의 평가손익에 따라 알림을 받습니다.')
                .addStringOption((option) =>
                    option.setName('종류')
                        .setDescription('상품의 종류')
                        .addChoices(
                            { name: '주식', value: 'stock' },
                            { name: '선물', value: 'future' },
                            { name: '옵션', value: 'option' },
                            { name: '바이너리 옵션', value: 'binary_option' },
                        )
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option.setName('종목')
                        .setDescription('알림을 받을 종목 코드 또는 종목명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('평가손익')
                        .setDescription('알림을 받을 평가손익')
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('계좌')
                .setDescription('투자한 상품의 전체 평가손익에 따라 알림을 받습니다.')
                .addIntegerOption((option) =>
                    option.setName('평가손익')
                        .setDescription('알림을 받을 평가손익')
                        .setRequired(true)
                )
        ),
    
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === '포지션') {
            
        } else if (subCommand === '종목') {

        } else if (subCommand === '계좌') {

        }
    }
}