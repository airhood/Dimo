const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('도움말')
        .setDescription('도움말을 확인합니다.'),
    
    async execute(interaction) {
        const helpContent = `
- 주식을 포함한 모든 가격은 **1분마다 변동**됩니다.
- 모든 명령어의 적용 시간은 명령어 실행 정보가 **서버에 도착하였을 때를 기준**으로 합니다.
  (예시: 디스코드에서 명령어를 5:47에 사용했어도 서버에 5:48에 정보다 도착하였다면 5:48을 기준으로 적용됩니다.)
- **파생상품(선물, 옵션)의 가격**은 기초자산(주식)의 가격과 만기일까지 남은 시간, 금리를 고려하려 **내부 시뮬레이션에 의해 계산되어 결정**됩니다.
- **기준금리**는 **매달 랜덤하게 결정**되며, 같은 달이면 기준금리는 변동되지 않습니다.
- 예금금리, 적금금리, 대출금리는 기준금리를 기반으로 계산되어 결정됩니다. 이 또한 같은 달이면 변동되지 않습니다.
- 투자 실패로 인해 계좌의 잔액이 **음수**로 내려갈 수 있습니다.
  (높은 레버리지의 선물 상품 등 투자에 실패한 경우)
- **파산 신청** 시 **계좌를 초기화**하고, 프로필에 **파산 업적**이 추가됩니다.
  (파산신청을 위해서는 계좌에 **대출을 제외한 자산**을 가지고 있지 않아야 하고, **현금 자산이 음수**인 상태이어야 합니다.)
- 모든 도박 게임에서 수학적으로 돈을 벌 확률과 잃을 확률은 동일합니다.
`;

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('도움말')
                    .setDescription(helpContent)
            ],
        });
    }
}