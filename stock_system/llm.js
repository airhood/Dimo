const { generateText } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { serverLog } = require('../server/server_logger');

const config = require('../config.json');

// Build the model once at startup.
// Priority: OpenAI (if key present) → Gemini
let _model;
function getModel() {
    if (_model) return _model;

    if (config.openai_api_key) {
        const { createOpenAI } = require('@ai-sdk/openai');
        const openai = createOpenAI({ apiKey: config.openai_api_key });
        _model = openai('gpt-4o-mini');
        serverLog('[INFO] LLM: using OpenAI gpt-4o-mini');
    } else {
        const googleAI = createGoogleGenerativeAI({ apiKey: config.gemini_api_key });
        _model = googleAI('gemini-2.0-flash');
        serverLog('[INFO] LLM: using Google gemini-2.0-flash');
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

module.exports = { llmGenerate };
