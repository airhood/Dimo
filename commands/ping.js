'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('핑')
        .setDescription('봇의 응답 속도를 확인합니다.'),

    async execute(interaction) {
        const sent = await interaction.reply({ content: '측정 중...', fetchReply: true });
        const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
        const wsLatency = interaction.client.ws.ping;

        const color = roundtrip < 200 ? 0x2ecc71 : roundtrip < 500 ? 0xE57E22 : 0xEA4144;

        await interaction.editReply({
            content: null,
            embeds: [
                new EmbedBuilder()
                    .setColor(color)
                    .setTitle('🏓 퐁!')
                    .addFields(
                        { name: '왕복 지연시간', value: `\`${roundtrip}ms\``, inline: true },
                        { name: 'WebSocket 핑', value: `\`${wsLatency}ms\``, inline: true },
                    )
                    .setTimestamp()
            ],
        });
    },
};
