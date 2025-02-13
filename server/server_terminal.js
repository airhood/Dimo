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
                const detailsContent = details.join(' ');
                banUser(id, detailsContent);
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
            .action((title, content) => {
                postNotics(title.join(' '), content.join(' '));
            });
        
        rl.on('line', (line) => {
            const parsedArgs = yargsParser(line);
            const commandArgs = parsedArgs._;
            const customArgs = ['node', 'index.js', ...commandArgs];
            program.parse(customArgs);
        });
    }
}