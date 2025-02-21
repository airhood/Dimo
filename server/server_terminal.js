const readline = require('readline');
const { program } = require('commander');
const yargsParser = require('yargs-parser');
const { banUser, postNotics } = require('../database');
const { addKeyword, removeKeyword } = require('../chat_bot/message_filter');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

module.exports = {
    initTerminal() {
        program.command('ban <id> "[details...]"')
            .action((id, details) => {
                const cleanedDetails = details.replace(/^"|"$/g, '');
                banUser(id, cleanedDetails);
            });
        
        program.command('add_keyword <keyword>')
            .action((keyword) => {
                addKeyword(keyword.trim());
            });
        
        program.command('remove_keyword <keyword>')
            .action((keyword) => {
                removeKeyword(keyword.trim());
            });
        
        program.command('notice "<title...>" "<content...>"')
            .action(async (title, content) => {
                const cleanedTitle = title.replace(/^"|"$/g, '');
                const cleanedContent = content.replace(/^"|"$/g, '');
                postNotics(cleanedTitle, cleanedContent);
            });
        
        rl.on('line', async (line) => {
            const parsedArgs = yargsParser(line);
            const commandArgs = parsedArgs._;

            try {
                await program.parseAsync(commandArgs, { from: 'user' });
            } catch (err) {
                console.log(`[COMMAND_ERROR] ${err}`);
            }
        });
    }
}