const { GoogleGenerativeAI } = require("@google/generative-ai");
const { gemini_api_key } = require('../config.json');
const fs = require('fs');
const { serverLog } = require("../server/server_logger");
const { getCompanyInfo } = require("./company_info");

const genAI = new GoogleGenerativeAI(gemini_api_key);

const systemInstruction = `기업에 대한 뉴스를 만들어줘.
대신 헤드라인(제목)만 만들면 돼.
그리고 기업의 이름은 내가 알려주는 걸로 하면 되고, 꼭 기업의 이름이 언급되야 하는건 아니야.
그리고 그 기업에 대한 전반적인 설명도 해줄테니까 그거 참고해서 뉴스 제목 써줘.
그리고 내가 좋은 뉴스를 써야하는지, 안좋은 뉴스를 써야하는지를 뉴스의 종류를 알려줄건데,
내가 희보라고 하면 좋은 뉴스 즉 기업의 주가가 오를만한 뉴스,
내가 비보라고 하면 안좋은 뉴스 즉 기업의 주가가 하락할만한 뉴스를 써주면 돼.
그리고 답변은 뉴스의 제목만 써줘.`;

const modelParams = {
    model: "gemini-1.5-flash",
    systemInstruction: systemInstruction,
};

const model = genAI.getGenerativeModel(modelParams);

const newsData = {};


const goodNewsPrompt = '희보';
const badNewsPrompt = '비보';


const currentHourNews = [];


module.exports = {
    async loadNews() {
        return new Promise((resolve, reject) => {
            fs.access('./data/news.txt', fs.constants.F_OK, (err) => {
                if (err) {
                    serverLog(`[ERROR] File 'news.txt' is missing`);
                    return reject(new Error('File is missing'));
                }

                fs.readFile('./data/news.txt', 'utf-8', (err, data) => {
                    if (err) {
                        serverLog(`[ERROR] Error reading 'news.txt': ${err}`);
                        return reject(new Error('Error reading file'));
                    }

                    if (!data.trim()) {
                        serverLog(`[ERROR] 'news.txt' is empty or unreadable.`);
                        return reject(new Error('File data missing'));
                    }

                    const lines = data.split('\n');

                    let currentCompanyName;
                    let currentGoodNews = [];
                    let currentBadNews = [];
                    lines.forEach(line => {
                        if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
                            if (currentCompanyName) {
                                const currentNews = {
                                    goodNews: currentGoodNews,
                                    badNews: currentBadNews,
                                };
                                newsData[currentCompanyName] = currentNews;
                            }
                            currentCompanyName = line.trim().slice(1, -1);
                            currentGoodNews = [];
                            currentBadNews = [];
                        } else if (line.trim() !== '') {
                            if (line.trim().startsWith('$')) {
                                currentGoodNews.push(line.trim());
                            } else if (line.trim().startsWith('!')) {
                                currentBadNews.push(line.trim());
                            } else {
                                serverLog('[ERROR] Error loading news data. State undetermined news.');
                            }
                        }
                    });

                    if (currentCompanyName) {
                        newsData[currentCompanyName] = {
                            goodNews: currentGoodNews,
                            badNews: currentBadNews,
                        };
                    }

                    return resolve();
                });
            });
        });
    },

    async saveNews() {
        const lines = [];
        for (const [ticker, news] of Object.entries(newsData)) {
            lines.push(`[${ticker}]`);
            news.goodNews.forEach(item => lines.push(item));
            news.badNews.forEach(item => lines.push(item));
        }
        const content = lines.join('\n');
        fs.writeFile('./data/news.txt', content, 'utf-8', (err) => {
            if (err) {
                serverLog(`[ERROR] Error writing 'news.txt': ${err}`);
                return;
            }
            serverLog('[INFO] Save news success.');
        });
    },

    async generateNewsData(companyName, companyDescription, state) {
        const chat = model.startChat();
        const prompt = `기업 이름: ${companyName}\n기업 설명: ${companyDescription}\n뉴스 종류: ${state}`;
        const result = await chat.sendMessage(prompt);
        const content = result.response.text();
        return content;
    },

    async cacheNextHourNews() {
        for (const [ticker, news] of Object.entries(newsData)) {
            if (news.goodNews.length < 10) {
                for (let i = 0; i < 5; i++) {
                    const companyInfo = getCompanyInfo(ticker);
                    if (!companyInfo) continue;
                    const content = await this.generateNewsData(companyInfo.companyName, companyInfo.companyDescription, goodNewsPrompt);
                    news.goodNews.push(content);
                }
            }
            if (news.badNews.length < 10) {
                for (let i = 0; i < 5; i++) {
                    const companyInfo = getCompanyInfo(ticker);
                    if (!companyInfo) continue;
                    const content = await this.generateNewsData(companyInfo.companyName, companyInfo.companyDescription, badNewsPrompt);
                    news.badNews.push(content);
                }
            }
        }
    },

    async publishNews(ticker, state) {
        if (ticker in newsData) {
            if (state === true) {
                if (newsData[ticker].goodNews.length === 0) return null;
                return newsData[ticker].goodNews.pop();

            } else {
                if (newsData[ticker].badNews.length === 0) return null;
                return newsData[ticker].badNews.pop();
            }
        }
        return null;
    },

    async loadCurrentNews() {
        return new Promise((resolve, reject) => {
            fs.access('./data/current_hour_news.txt', fs.constants.F_OK, (err) => {
                if (err) {
                    serverLog(`[ERROR] File 'current_hour_news.txt' is missing`);
                    return reject(new Error('File is missing'));
                }

                fs.readFile('./data/current_hour_news.txt', 'utf-8', (err, data) => {
                    if (err) {
                        serverLog(`[ERROR] Error reading 'current_hour_news.txt': ${err}`);
                        return reject(new Error('Error reading file'));
                    }

                    if (!data.trim()) {
                        serverLog(`[ERROR] 'current_hour_news.txt' is empty or unreadable.`);
                        return reject(new Error('File data missing'));
                    }

                    const lines = data.split('\n');

                    for (const line of lines) {
                        if (line.trim() !== '') {
                            currentHourNews.push(line.trim());
                        }
                    }

                    return resolve();
                });
            });
        });
    },

    async saveCurrentHourNews() {
        const formattedContent = currentHourNews.join('\n');
        fs.writeFile('./data/current_hour_news.txt', formattedContent, 'utf-8', (err) => {
            if (err) {
                serverLog(`[ERROR] Error writing 'current_hour_news.txt': ${err}`);
                return;
            }

            serverLog('[INFO] Save current hour news success.');
        });
    },

    async clearCurrentNews() {
        currentHourNews.length = 0;
        await this.saveCurrentHourNews();
    },

    getCurrentHourNews() {
        return currentHourNews;
    }
}
