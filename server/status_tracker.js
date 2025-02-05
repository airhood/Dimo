const { EmbedBuilder } = require('@discordjs/builders');
const { adminGuildId, statusChannelId } = require('../config.json');
const schedule = require('node-schedule');
const moment = require('moment-timezone');

let client;
let channel;
let message;

let serverStartTime = moment(new Date()).format('YYYY-MM-DD HH:mm');

async function setupStatusChannel() {
    if (process.env.NODE_ENV === 'production') {
        const guild = client.guilds.cache.get(adminGuildId);
        if (!guild) {
            console.log(`[ERROR] Admin server not found. adminGuildId: ${adminGuildId}`)
            return;    
        }
    
        channel = guild.channels.cache.get(statusChannelId);
    
        message = await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('디모봇 상태')
                    .addFields(
                        { name: '서버 시작 시간', value: `${serverStartTime}`, inline: true },
                        { name: '마지막 응답 시간', value: `${moment(new Date()).format('YYYY-MM-DD HH:mm')}`, inline: true }
                    )
            ],
        });
    }
}

function updateStatus() {
    if (!message) return;
    
    message.edit({
        embeds: [
            new EmbedBuilder()
                .setTitle('디모봇 상태')
                .addFields(
                    { name: '서버 시작 시간', value: `${serverStartTime}`, inline: true },
                    { name: '마지막 응답 시간', value: `${moment(new Date()).format('YYYY-MM-DD HH:mm')}`, inline: true }
                )
        ],
    });
}

if (process.env.NODE_ENV === 'production') {
    schedule.scheduleJob('* * * * *', () => {
        updateStatus();
    });
}

module.exports = {
    setClient_status_tracker: (_client) => {
        client = _client;
    },

    setupStatusChannel: setupStatusChannel,
}