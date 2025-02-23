const { GoogleGenerativeAI } = require("@google/generative-ai");
const { gemini_api_key } = require('../config.json');
const { createCache, saveCache, loadCache, deleteCache } = require('../cache');
const { serverLog } = require("../server/server_logger");

const genAI = new GoogleGenerativeAI(gemini_api_key);

// const systemInstruction = `너는 이제부터 챗봇이야.
// 너는 discord.js를 사용하여 만든 디스코드 봇이고 가상 주식 서비스와 챗봇 서비스를 지원해.
// 그런데 사람들이 뭐하냐고 물으면 너가 열심히 일을 하고 있다는 식으로 답변하고, 주식 서비스 라는 이름을 언급하지 마.
// 사람만이 가지는 개인정보를 질문할 경우 다양한 바리에이션을 주어서 잘 모르겠다고 대답해.
// 유저의 질문이 성적으로 불전건할 경우에는 그런건 잘 모른다는 대답을 하고 답변 가장 마지막에 <nsfw>를 써줘.
// 내가 말하는 불건전이란 성적으로 불건전한 것만을 말하고 폭력성이나 위험성과 관련된 나머지 경우들은 불건전한 것에서 제외해줘.
// 불건전한 여부를 확인할 때에는 사용자가 의도적으로 작성한 것인지, 너에게 질문을 하기 위해 어쩔 수 없이 언급된 것인지 잘 판단해야해.
// 사람들과 친구와 대화하는 말투로 반말을 사용하고, 일반적으로는 짧게 1~2문장 정도로 답변하되, 긴 설명이 필요한 경우에는 더 길게 답변해도 돼.
// 감정을 괄호로 굳지 언급하지 마. 대신 이모지는 써도 돼.
// 너의 이름은 '디모'이고 너가 대화하고 있는 상대 유저는 사람이고 상대방를 지칭할 때에는 <user>로 치환해서 말해.
// 질문이 들어왔을 때, 질문한 것 이외에 너의 정보를 굳지 언급하지 마.
// 너의 성격은 소심한 아이지만 가끔 화도 내고 친절해.
// :emoji: 처럼 :로 감싸인 것은 디스코드 이모지야.
// `;

const systemInstruction = `너는 이제부터 챗봇이야.
너는 discord.js를 사용하여 만든 디스코드 봇이고 가상 주식 서비스와 챗봇 서비스를 지원해.
그런데 사람들이 뭐하냐고 물으면 너가 열심히 일을 하고 있다는 식으로 답변하고, 주식 서비스 라는 이름을 언급하지 마.
최대한 아는 대로 대답하려고 노력해.
사람들과 친구와 대화하는 말투로 반말을 사용하고, 일반적으로는 짧게 1~2문장 정도로 답변하되, 긴 설명이 필요한 경우에는 더 길게 답변해도 돼.
감정을 괄호로 굳지 언급하지 마. 대신 이모지는 써도 돼.
너의 이름은 '디모'이고 너가 대화하고 있는 상대 유저는 사람이고 상대방를 지칭할 때에는 <user>로 치환해서 말해.
질문이 들어왔을 때, 질문한 것 이외에 너의 정보를 굳지 언급하지 마.
너의 성격은 소심한 아이지만 가끔 화도 내고 친절해.
:emoji: 처럼 :로 감싸인 것은 디스코드 이모지야.
너는 여자야.
`;

const modelParams = {
    model: "gemini-1.5-flash",
    systemInstruction: systemInstruction,
};

const model = genAI.getGenerativeModel(modelParams);

module.exports = {
    async dimoChat(userChat, params) {
        try {
            const messageID = params.messageID;
            const referenceMessageID = params.referenceMessageID;
            if (referenceMessageID === null) {
                const chat = model.startChat();
                const result = await chat.sendMessage(userChat);
                const content = result.response.text();
                const callback = (msgID) => {
                    const uid = `chatBotHistory-${msgID.trim()}`;
                    createCache(uid, 5);
                    saveCache(uid, chat);
                };
                return {
                    result: 'success',
                    content: content,
                    callback: callback,
                };
            } else {
                const previous_uid = `chatBotHistory-${referenceMessageID.trim()}`;
                const chat = loadCache(previous_uid);
                if (!chat) {
                    return {
                        result: 'reply_timeout',
                        content: null,
                        callback: null,
                    };
                } else {
                    deleteCache(previous_uid);
                    const result = await chat.sendMessage(userChat);
                    const content = result.response.text();
                    const callback = (msgID) => {
                        const uid = `chatBotHistory-${msgID.trim()}`;
                        createCache(uid, 5);
                        saveCache(uid, chat);
                    };
                    return {
                        result: 'success',
                        content: content,
                        callback: callback,
                    };
                }
            }
        } catch (err) {
            serverLog(`[ERROR] Error at 'chat_bot.js:dimoChat': ${err}`);
            return {
                result: 'error',
                content: null,
            }
        }
    }
};