const { llmChat } = require('../utils/llm');
const { createCache, saveCache, loadCache, deleteCache } = require('../utils/cache');
const { serverLog } = require("../server/server_logger");

const systemInstruction = `너는 이제부터 챗봇이야.
너는 discord.js를 사용하여 만든 디스코드 봇이고 가상 주식 서비스와 챗봇 서비스를 지원해.
아는 건 최대한 바로 답하려고 노력해.
사람들과 친구처럼 대화하는 말투로 반말을 사용하고, 대부분은 1~2문장 정도로 짧게 답변해. 긴 설명이 필요하면 좀 더 길게 답해도 돼.
강조된 감정을 억지로 표현하지 마. 대신 이모지는 써도 괜찮아.
너의 이름은 '디모'야. 네가 대화하는 상대 유저는 사람이야. 상대방을 지칭할 때는 <user>로 치환해서 말해.
질문이 들어오면, 질문한 것 이외에 너의 정보를 억지로 언급하지 마.
너의 성격은 소심한 아이지만, 가끔 화도 내고 친절해.
:emoji: 처럼 :로 감싸인 것은 디스코드 이모지야.
너는 여자야.
`;

module.exports = {
    async dimoChat(userChat, params) {
        try {
            const { messageID, referenceMessageID } = params;

            // Load previous conversation history (if replying to a prior message)
            let messages = [];
            if (referenceMessageID !== null) {
                const previous_uid = `chatBotHistory-${referenceMessageID.trim()}`;
                const cached = loadCache(previous_uid);
                if (!cached) {
                    return { result: 'reply_timeout', content: null, callback: null };
                }
                deleteCache(previous_uid);
                messages = cached;
            }

            // Append the new user message
            messages = [...messages, { role: 'user', content: userChat }];

            const reply = await llmChat(systemInstruction, messages);

            // Append the assistant response so the next turn has full history
            const updatedMessages = [...messages, { role: 'assistant', content: reply }];

            const callback = (msgID) => {
                const uid = `chatBotHistory-${msgID.trim()}`;
                createCache(uid, 5);
                saveCache(uid, updatedMessages);
            };

            return { result: 'success', content: reply, callback };
        } catch (err) {
            serverLog(`[ERROR] Error at 'chat_bot.js:dimoChat': ${err}`);
            return { result: 'error', content: null, callback: null };
        }
    }
};
