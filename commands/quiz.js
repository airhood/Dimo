const { SlashCommandBuilder, EmbedBuilder, ButtonStyle, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');

const PRIZE = {
    '1': 10000,
    '2': 100000,
    '3': 500000,
    '4': 1000000,
};

function makeAnswerButton(userId, uid) {
    const answerButton = new ButtonBuilder()
        .setCustomId(`quiz_answer-${userId}-${uid}`)
        .setLabel('정답 제출')
        .setStyle(ButtonStyle.Success);
    return new ActionRowBuilder().addComponents(answerButton);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('퀴즈')
        .setDescription('퀴즈를 맞추면 문제 난이도에 따라 돈을 지급받습니다.')
        .addStringOption((option) =>
            option.setName('난이도')
                .setDescription('퀴즈 난이도를 선택합니다.')
                .setChoices(
                    { name: '최상 (100만원)', value: '4' },
                    { name: '상 (50만원)', value: '3' },
                    { name: '중 (10만원)', value: '2' },
                    { name: '하 (1만원)', value: '1' },
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        const level = interaction.options.getString('난이도');
        const prize = PRIZE[level];

        let quizText;
        let answer;

        if (level === '1') {
            const ops = ['+', '-', '*'];
            const op = ops[Math.floor(Math.random() * 3)];
            const a = Math.floor(Math.random() * 100) + 1;
            const b = Math.floor(Math.random() * 100) + 1;
            const fn = new Function('a', 'b', `return a ${op} b;`);
            answer = fn(a, b).toString();
            quizText = `${a} ${op} ${b} = ?`;

        } else if (level === '2') {
            const ops = ['+', '-', '*'];
            const op1 = ops[Math.floor(Math.random() * 3)];
            const op2 = ops[Math.floor(Math.random() * 3)];
            const a = Math.floor(Math.random() * 90) + 10;
            const b = Math.floor(Math.random() * 90) + 10;
            const c = Math.floor(Math.random() * 99) + 1;
            const fn = new Function('a', 'b', 'c', `return a ${op1} b ${op2} c;`);
            answer = fn(a, b, c).toString();
            quizText = `${a} ${op1} ${b} ${op2} ${c} = ?`;

        } else if (level === '3') {
            const ops = ['+', '-', '*'];
            const op1 = ops[Math.floor(Math.random() * 3)];
            const op2 = ops[Math.floor(Math.random() * 3)];
            const a = Math.floor(Math.random() * 900) + 100;
            const b = Math.floor(Math.random() * 900) + 100;
            const c = Math.floor(Math.random() * 900) + 100;
            const d = Math.floor(Math.random() * 90) + 10;
            const fn = new Function('a', 'b', 'c', 'd', `return a ${op1} b ${op2} c * d;`);
            answer = fn(a, b, c, d).toString();
            quizText = `${a} ${op1} ${b} ${op2} ${c} × ${d} = ?`;

        } else if (level === '4') {
            const a = Math.floor(Math.random() * 16) + 5;
            const b = Math.floor(Math.random() * 90) + 10;
            const c = Math.floor(Math.random() * 90) + 10;
            const d = Math.floor(Math.random() * 99) + 1;
            const fn = new Function('a', 'b', 'c', 'd', `return a * a + b * c - d;`);
            answer = fn(a, b, c, d).toString();
            quizText = `${a}² + ${b} × ${c} - ${d} = ?`;
        }

        const uid = uuidv4().replace(/-/g, '');
        createCache(uid, 15);
        saveCache(uid, { answer, prize });

        const row = makeAnswerButton(interaction.user.id, uid);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle('퀴즈')
                    .setDescription(`**난이도:** ${{ '1': '하', '2': '중', '3': '상', '4': '최상' }[level]} (보상: ${prize.toLocaleString()}원)\n\n\`\`\`${quizText}\`\`\``)
            ],
            components: [row],
        });
    }
}
