const { generateText } = require('ai');
const { serverLog } = require('../server/server_logger');
const config = require('../config.json');

let _model;
function getModel() {
    if (_model) return _model;

    const { llm_provider, llm_model, llm_api_key } = config;

    if (llm_provider === 'openai') {
        const { createOpenAI } = require('@ai-sdk/openai');
        _model = createOpenAI({ apiKey: llm_api_key })(llm_model);
        serverLog(`[INFO] LLM: using OpenAI ${llm_model}`);
    } else {
        const { createGoogleGenerativeAI } = require('@ai-sdk/google');
        _model = createGoogleGenerativeAI({ apiKey: llm_api_key })(llm_model);
        serverLog(`[INFO] LLM: using Google ${llm_model}`);
    }
    return _model;
}

/**
 * Generate a single text response.
 * @param {string} system  System instruction
 * @param {string} prompt  User prompt
 * @returns {Promise<string>}
 */
async function llmGenerate(system, prompt) {
    const { text } = await generateText({
        model: getModel(),
        system,
        prompt,
    });
    return text.trim();
}

/**
 * Generate a response in a multi-turn conversation.
 * @param {string} system    System instruction
 * @param {Array}  messages  [{ role: 'user'|'assistant', content: string }, ...]
 * @returns {Promise<string>}
 */
async function llmChat(system, messages) {
    const { text } = await generateText({
        model: getModel(),
        system,
        messages,
    });
    return text.trim();
}

module.exports = { llmGenerate, llmChat };
