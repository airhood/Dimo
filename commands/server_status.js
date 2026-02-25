'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSessionCount } = require('../systems/realtime_manager');
const { memoryUsage } = require('../server/resource_monitor');
const AutoTrade = require('../schemas/auto_trade');
const Notification = require('../schemas/notification');
const Reservation = require('../schemas/reservation');

const MEMORY_THRESHOLD_MB = 250;

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}일`);
    if (h > 0) parts.push(`${h}시간`);
    if (m > 0) parts.push(`${m}분`);
    parts.push(`${s}초`);
    return parts.join(' ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('서버상태')
        .setDescription('현재 서버에서 실행 중인 내부 서비스 상태를 표시합니다.'),

    async execute(interaction) {
        await interaction.deferReply();

        const [autoTradeCount, notificationCount, reservationCount] = await Promise.all([
            AutoTrade.countDocuments({ isRunning: true }),
            Notification.countDocuments(),
            Reservation.countDocuments({ status: 'pending' }),
        ]);

        const realtimeCount = getSessionCount();
        const memMB = (memoryUsage() / 1024 / 1024).toFixed(1);
        const memPct = ((memMB / MEMORY_THRESHOLD_MB) * 100).toFixed(0);
        const memColor = memMB < 150 ? '🟢' : memMB < 210 ? '🟡' : '🔴';
        const wsLatency = interaction.client.ws.ping;
        const uptime = formatUptime(Math.floor(process.uptime()));

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🖥️ 서버 상태')
            .addFields(
                {
                    name: '📡 실시간 업데이트',
                    value: `\`${realtimeCount}\`개 세션 활성`,
                    inline: true,
                },
                {
                    name: '🤖 자동매매',
                    value: `\`${autoTradeCount}\`개 실행 중`,
                    inline: true,
                },
                {
                    name: '🔔 등록된 알림',
                    value: `\`${notificationCount}\`개`,
                    inline: true,
                },
                {
                    name: '📋 대기 중인 예약',
                    value: `\`${reservationCount}\`개`,
                    inline: true,
                },
                {
                    name: '💾 메모리',
                    value: `${memColor} \`${memMB} MB\` / ${MEMORY_THRESHOLD_MB} MB (${memPct}%)`,
                    inline: true,
                },
                {
                    name: '🌐 WebSocket 핑',
                    value: wsLatency === -1 ? '`대기 중`' : `\`${wsLatency}ms\``,
                    inline: true,
                },
                {
                    name: '⏱️ 업타임',
                    value: `\`${uptime}\``,
                    inline: true,
                },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
