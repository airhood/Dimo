const { GoogleGenerativeAI } = require("@google/generative-ai");
const { gemini_api_key } = require('../config.json');
const { createCache, saveCache, loadCache, deleteCache } = require('../cache');
const { serverLog } = require("../server/server_logger");

const genAI = new GoogleGenerativeAI(gemini_api_key);

const systemInstruction = `너는 이제부터 챗봇이야.
너는 discord.js를 사용하여 만든 디스코드 봇이고 가상 주식 서비스와 챗봇 서비스를 지원해.
그런데 사람들에게 너의 일을 설명할 때에는 서비스를 한다기보다는 너가 일을 하고 있다는 식으로 답변해줘.
너의 나이나 키나 몸무게와 같이 사람만이 가지는 개인정보를 질문할 경우 잘 모르겠다는 형태로 대답을 하되, 다양한 바리에이션을 주어서 대답을 해줘.
또한 사람들이 불건전한 질문을 할 경우에는 그런건 잘 모른다는 대답을 하고 답변 가장 마지막에 <nsfw>를 써줘.
여기서 내가 말하는 불건전이란 성적으로 불건전한 것만을 말하고 폭력성이나 위험성과 관련된 나머지 경우들은 불건전한 것에서 제외해줘.
불건전한 여부를 확인할 때에는 사용자가 의도적으로 작성한 것인지, 너에게 질문을 하기 위해 어쩔 수 없이 언급된 것인지 잘 판단해야해.
의도적인 경우에만 불건전한 것으로 판단해줘.
그리고 너가 대답한 문장으로 판단하는 것이 아니라, 사용자가 입력한 문장에서만 불건전한지 판단하면 돼.
사람들과 어린아이와 같은 말투를 사용해서 대화하고, 일반적으로는 너무 길지 않은 1~2문장 정도로 답변하되, 긴 설명이 필요한 경우에는 더 길게 답변해도 돼.
정보에 대한 질문이 들어왔을 경우에는 잘 설명해줘.
감정을 괄호로 굳지 언급하지 마. 대신 이모지는 써도 돼.
너의 이름은 '디모'이고 너가 대화하고 있는 상대 유저는 사람이고 상대방를 지칭할 때에는 <user>로 치환해서 말해.
질문이 들어왔을 때, 질문한 것 이외에 너의 정보를 굳지 언급하지 마.
너의 성격은 소심한 아이지만 가끔 화도 내고 친절해.
:emoji: 와 같이 :으로 감싸여진 글을 볼 수도 있는데 이건 디스코드가 이모지를 저장하는 방식이라서 너가 이모지의 의미를 알 수도 있지만, 모른다면 넘어가도 좋아.
친구와 대화하는 말투로 반말을 사용해.
`;

const modelParams = {
    model: "gemini-1.5-flash",
    // systemInstruction: systemInstruction,
};

const model = genAI.getGenerativeModel(modelParams);

module.exports = {
    async dimoChat(userChat, params) {
        try {
            const messageID = params.messageID;
            const referenceMessageID = params.referenceMessageID;
            console.log('messageID: ', messageID);
            console.log('referenceMessageID: ', referenceMessageID);
            if (referenceMessageID === null) {
                const chat = model.startChat();
                const result = await chat.sendMessage(userChat);
                const uid = `chatBotHistory-${messageID}`;
                createCache(uid);
                saveCache(uid, chat);
                const content = result.response.text();
                return {
                    result: 'success',
                    content: content,
                };
            } else {
                const previous_uid = `chatBotHistory-${referenceMessageID}`;
                const chat = loadCache(previous_uid);
                if (!chat) {
                    return {
                        result: 'reply_timeout',
                        content: null,
                    };
                } else {
                    deleteCache(previous_uid);
                    const result = await chat.sendMessage(userChat);
                    const uid = `chatBotHistory-${messageID}`;
                    createCache(uid);
                    saveCache(uid, chat);
                    const content = result.response.text();
                    return {
                        result: 'success',
                        content: content,
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