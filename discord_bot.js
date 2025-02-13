const fs = require('node:fs');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { token } = require('./config.json');

const { increaseLevelPoint, checkUserExists } = require('./database');
const { addInteractionHandler } = require('./interaction');
const { serverLog, setClient_server_logger, setupAdminChannel } = require('./server/server_logger');
const { loadRecentStockData } = require('./stock_system/stock_sim');
const { setClient_status_tracker, setupStatusChannel } = require('./server/status_tracker');
const { setTerminal } = require('./server/server_terminal');
const { dimoChat } = require('./chat_bot/chat_bot');
const { startBucketCycle, addToBucket, existsInCurrentBucket } = require('./message_reference_tracker');
const { filterMessage } = require('./chat_bot/message_filter');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.commands = new Collection();

function loadSlashCommands() {
	const foldersPath = path.join(__dirname, 'commands');
	
	const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(foldersPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

module.exports = {
	async setup() {
		loadSlashCommands();

		client.on(Events.InteractionCreate, async interaction => {
			if (!interaction.isChatInputCommand()) return;
			
			const command = interaction.client.commands.get(interaction.commandName);
		
			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}
		
			try {
				const userExists = await checkUserExists(interaction.user.id);
		
				if ((userExists === false) && (interaction.commandName !== '회원가입')) {
					await interaction.reply({
						embeds: [
							new EmbedBuilder()
								.setColor(0xEA4144)
								.setTitle('계정이 없습니다')
								.setDescription('가입된 계정이 없습니다.\n회원가입은 **/회원가입** 을 통해 가능합니다.')
						],
					});
					return;
				}
		
				await command.execute(interaction);
		
				if (interaction.commandName !== '회원가입') {
					await increaseLevelPoint(interaction.user.id);
				}
			} catch (error) {
				console.error(error);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
				} else {
					try {
						await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
					} catch (err) {
						try {
							await interaction.editReply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
						} catch (err) {
							
						}
					}
				}
			}
		});
		
		
		client.on(Events.GuildCreate, async (guild) =>{
			serverLog(`[INFO] Joined a new guild: ${guild.name}`);
		});
		
		
		client.once(Events.ClientReady, (readyClient) => {
			serverLog(`[INFO] Bot ready! Logged in as ${readyClient.user.tag}`);
			setClient_server_logger(client);
			setClient_status_tracker(client);
			setupAdminChannel();
			setupStatusChannel();
		});
		
		client.on(Events.MessageCreate, async (message) => {
			if (message.author.bot) return;
		
			const DIMO_PREFIX = '디모야';
			if (message.content.startsWith(DIMO_PREFIX)) {
				const userMessage = message.content.slice(DIMO_PREFIX.length).trim();
		
				if (message.content.trim() === DIMO_PREFIX) {
					await message.reply('나 불렀어?');
					addToBucket(null, true);
				}else if (userMessage) {
					if (message.reference) {
						const referenceMessageID = message.reference.messageId;
						if (existsInCurrentBucket(referenceMessageID) === true) {
							const result = await dimoChat(message.content, {
								messageID: message.id,
								referenceMessageID: referenceMessageID,
							});
		
							if (result.result === 'success') {
								const content = result.content;
								const formattedContent = content.replace(/<user>/g, message.author.username);
								
								let messageID;
								if (filterMessage(formattedContent)) {
									const sent = await message.reply(formattedContent);
									addToBucket(sent, false);
									messageID = sent.id;
								} else {
									const sent = await message.reply(`${formattedContent}\n\n**부적절한 내용 전송으로 경고가 부여되었습니다.**`);
									addToBucket(sent, false);
									messageID = sent.id;
								}
		
								result.callback(messageID.trim());
							} else if (result.result === 'reply_timeout') {
								await message.reply('내용이 기억이 안나.');
								console.log('a');
								addToBucket(null, true);
							} else {
								await message.reply('으악! 오류가 발생했어.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해줘.');
								addToBucket(null, true);
							}
						} else if (existsInCurrentBucket(referenceMessageID) === 'special') {
							const result = await dimoChat(message.content, {
								messageID: message.id,
								referenceMessageID: null,
							});
			
							if (result.result === 'success') {
								const content = result.content;
								const formattedContent = content.replace(/<user>/g, message.author.username);
		
								let messageID;
								if (filterMessage(formattedContent)) {
									const sent = await message.reply(formattedContent);
									addToBucket(sent, false);
									messageID = sent.id;
								} else {
									const sent = await message.reply(`${formattedContent}\n\n**부적절한 내용 전송으로 경고가 부여되었습니다.**`);
									addToBucket(sent, false);
									messageID = sent.id;
								}
		
								result.callback(messageID.trim());
							} else if (result.result === 'reply_timeout') {
								await message.reply('내용이 기억이 안나.');
								addToBucket(null, true);
							} else {
								await message.reply('으악! 오류가 발생했어.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해줘.');
								addToBucket(null, true);
							}
						} else {
							await message.reply('내용이 기억이 안나.');
							addToBucket(null, true);
						}
					} else {
						const result = await dimoChat(message.content, {
							messageID: message.id,
							referenceMessageID: null,
						});
		
						if (result.result === 'success') {
							const content = result.content;
							const formattedContent = content.replace(/<user>/g, message.author.displayName);
		
							let messageID;
							if (filterMessage(formattedContent)) {
								const sent = await message.reply(formattedContent);
								addToBucket(sent, false);
								messageID = sent.id;
							} else {
								const sent = await message.reply(`${formattedContent}\n\n**부적절한 내용 전송으로 경고가 부여되었습니다.**`);
								addToBucket(sent, false);
								messageID = sent.id;
							}
		
							result.callback(messageID.trim());
						} else if (result.result === 'reply_timeout') {
							await message.reply('내용이 기억이 안나.');
							addToBucket(null, true);
						} else {
							await message.reply('으악! 오류가 발생했어.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해줘.');
							addToBucket(null, true);
						}
					}
				}
			}
		});
		
		addInteractionHandler(client);
		

		client.login(token);
	}
}
