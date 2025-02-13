const fs = require('fs');
const { adminGuildId, adminChannelId } = require('../config.json');
const { EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
require('dotenv').config();

let serverLogBuffer = []

function archiveLog() {
    fs.appendFile('./log/server-log.log', serverLogBuffer.join('\n') + '\n', 'utf-8', (err) => {
        if (err) {
            module.exports.serverLog(`[ERROR] Error writing 'server-log.log': ${err}`);
        }
    });
    serverLogBuffer = [];
}

let client;
let channel;
let role;

let _isReady = false;

function setupAdminChannel() {
    if (process.env.NODE_ENV === 'production') {
        const guild = client.guilds.cache.get(adminGuildId);
        if (!guild) {
            console.error(`[LOGGER_ERROR] Admin server not found. adminGuildId: ${adminGuildId}`);
            return;
        }
    
        channel = guild.channels.cache.get(adminChannelId);
    
        role = guild.roles.cache.get('1332029929491267695');
    }

    _isReady = true;
}

function sendErrorLog(message) {
    if (channel) {
        if (role) {
            channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Server Error')
                        .setDescription(`${role}\n${message}`)
                        .setTimestamp()
                ],
            });
        } else {
            console.error(`[LOGGER_ERROR] Error mention role not found. Retrying...`);
            setupAdminChannel();
        }
    } else {
        console.error(`[LOGGER_ERROR] Admin channel not found. adminChannelId: ${adminChannelId}. Retrying...`);
        setupAdminChannel();
    }
}

module.exports = {
    setClient_server_logger: (_client) => {
        client = _client;
    },

    isReady() {
        return _isReady;
    },

    async serverLog(message) {
        console.log(message);
        if (message.startsWith('[ERROR]')) {
            if (process.env.NODE_ENV === 'production') {
                sendErrorLog(message);
            }
        }

        const formattedDate = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');
        serverLogBuffer.push(`[${formattedDate}] ${message}`);

        if (serverLogBuffer.length >= 20) {
            archiveLog();
        }
    },

    setupAdminChannel: setupAdminChannel,
}