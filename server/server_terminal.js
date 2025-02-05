const readline = require('readline');
const { program } = require('commander');
const yargsParser = require('yargs-parser');
const { banUser } = require('../database');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

module.exports = {
    setTerminal() {
        program
            .command('ban <id> [details...]')
            .action((id, details) => {
                const detailsContent = details.join(' ').slice(1, -1);
                banUser(id, detailsContent);
            });
        
        rl.on('line', (line) => {
            const parsedArgs = yargsParser(line);
            const commandArgs = parsedArgs._;
            const customArgs = ['node', 'index.js', ...commandArgs];
            program.parse(customArgs);
        });
    }
}