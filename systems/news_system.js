const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getCompanyInfo } = require('./company_info');
const { getStockName } = require('./stock_name');
const { llmGenerate } = require('../utils/llm');
const { serverLog } = require('../server/server_logger');

const NEWS_POOL_FILE = './data/news_pool.json';

// ── In-memory stores ──────────────────────────────────────────────────────────

// Premium news items available for purchase
// { id, ticker, direction, magnitude, tier, price, headline,
//   isForward, generatedAt, expiresAt, buyers: Set<userId> }
const premiumNewsPool = [];

// Free (noisy) news items for the current hour
// { ticker, displayTicker, displayDirection, tier }
const freeNewsPool = [];

// ── Tier & pricing ────────────────────────────────────────────────────────────

function getTier(magnitude) {
    if (magnitude >= 30) return 4;
    if (magnitude >= 15) return 3;
    if (magnitude >= 5)  return 2;
    return 1;
}

// Tier 1 (2-5%)   : 100만 ~ 300만
// Tier 2 (5-15%)  : 300만 ~ 1500만
// Tier 3 (15-30%) : 1500만 ~ 5000만
// Tier 4 (30%+)   : 5000만 ~ 1억
function calculateNewsPrice(magnitude) {
    if (magnitude < 5) {
        return Math.round(1_000_000 + ((magnitude - 2) / 3) * 2_000_000);
    } else if (magnitude < 15) {
        return Math.round(3_000_000 + ((magnitude - 5) / 10) * 12_000_000);
    } else if (magnitude < 30) {
        return Math.round(15_000_000 + ((magnitude - 15) / 15) * 35_000_000);
    } else {
        return Math.round(50_000_000 + (Math.min(magnitude - 30, 30) / 30) * 50_000_000);
    }
}

// ── AI headline generation ────────────────────────────────────────────────────

const SYSTEM_PROMPT =
    `주식 시장 뉴스 헤드라인을 한국어로 한 줄만 작성해줘.
기업명이 드러나야 하고, 주가 방향성이 암시되어야 해.
답변은 헤드라인 텍스트만 출력해.`;

async function generateHeadlineAsync(newsItem) {
    try {
        const companyInfo = getCompanyInfo(newsItem.ticker);
        const companyName = companyInfo ? companyInfo.companyName : getStockName(newsItem.ticker);
        const companyDesc = companyInfo ? companyInfo.companyDescription : '';
        const dirText = newsItem.direction === 'up' ? '상승 (희보)' : '하락 (비보)';
        const prompt = `기업: ${companyName} (${newsItem.ticker}) - ${companyDesc}\n방향: ${dirText} ${newsItem.magnitude.toFixed(1)}%`;
        newsItem.headline = await llmGenerate(SYSTEM_PROMPT, prompt);
    } catch (err) {
        serverLog(`[ERROR] news headline generation failed for ${newsItem.ticker}: ${err}`);
        newsItem.headline = '(헤드라인 생성 실패)';
    }
    saveNewsPool();
}

// ── Noise helpers for free news ───────────────────────────────────────────────

const UP_PHRASES   = ['강한 매수세 포착', '상승 기류 형성', '긍정적 시장 반응', '희소식 감지', '강세 신호'];
const DOWN_PHRASES = ['매도 압력 증가', '하락 신호 포착', '부정적 전망', '불안한 움직임 감지', '약세 신호'];

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Main detection entry point (called from stock_sim.js) ─────────────────────

/**
 * @param {Object} prevHourData  { ticker: number[60] } — just-completed hour
 * @param {Object} newHourData   { ticker: number[60] } — upcoming hour (forward)
 */
async function detectAndGenerateNews(prevHourData, newHourData) {
    // Clean up expired premium news
    const now = Date.now();
    for (let i = premiumNewsPool.length - 1; i >= 0; i--) {
        if (premiumNewsPool[i].expiresAt.getTime() < now) {
            premiumNewsPool.splice(i, 1);
        }
    }

    // Reset free news for this hour
    freeNewsPool.length = 0;

    for (const ticker of Object.keys(prevHourData)) {
        const prevPrices = prevHourData[ticker];
        const nextPrices = newHourData[ticker];
        if (!prevPrices || !nextPrices) continue;

        // ── Backward news (tier 1-2): what happened last hour ─────────────
        const backwardChange = (prevPrices[59] - prevPrices[0]) / prevPrices[0] * 100;
        const backwardMag    = Math.abs(backwardChange);

        if (backwardMag >= 2) {
            const direction = backwardChange > 0 ? 'up' : 'down';
            const tier      = getTier(backwardMag);

            if (tier <= 2) {
                const expiresAt = new Date(now + 2 * 60 * 60 * 1000);
                const item = {
                    id:          uuidv4(),
                    ticker,
                    direction,
                    magnitude:   backwardMag,
                    tier,
                    price:       calculateNewsPrice(backwardMag),
                    headline:    null,
                    isForward:   false,
                    generatedAt: new Date(now),
                    expiresAt,
                    buyers:      new Set(),
                };
                premiumNewsPool.push(item);

                // Free news: tier-1 gets noisy direction (30% wrong)
                const displayDirection =
                    (tier === 1 && Math.random() < 0.3)
                        ? (direction === 'up' ? 'down' : 'up')
                        : direction;
                freeNewsPool.push({ ticker, displayDirection, tier });
            }
        }

        // ── Forward news (tier 3-4): what will happen next hour ───────────
        const forwardChange = (nextPrices[59] - nextPrices[0]) / nextPrices[0] * 100;
        const forwardMag    = Math.abs(forwardChange);

        if (forwardMag >= 15) {
            const direction = forwardChange > 0 ? 'up' : 'down';
            const tier      = getTier(forwardMag);
            const expiresAt = new Date(now + 2 * 60 * 60 * 1000);
            const item = {
                id:          uuidv4(),
                ticker,
                direction,
                magnitude:   forwardMag,
                tier,
                price:       calculateNewsPrice(forwardMag),
                headline:    null,
                isForward:   true,
                generatedAt: new Date(now),
                expiresAt,
                buyers:      new Set(),
            };
            premiumNewsPool.push(item);
            // Generate AI headline async for tier 3-4
            generateHeadlineAsync(item);
        }
    }

    serverLog(`[INFO] News generated: ${premiumNewsPool.length} premium, ${freeNewsPool.length} free`);
    saveNewsPool();
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveNewsPool() {
    try {
        const data = {
            premium: premiumNewsPool.map(n => ({
                ...n,
                buyers:      [...n.buyers],
                generatedAt: n.generatedAt.toISOString(),
                expiresAt:   n.expiresAt.toISOString(),
            })),
            free: freeNewsPool.slice(),
        };
        fs.writeFileSync(NEWS_POOL_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
        serverLog(`[ERROR] Failed to save news pool: ${err}`);
    }
}

function loadNewsPool() {
    try {
        if (!fs.existsSync(NEWS_POOL_FILE)) return;
        const data = JSON.parse(fs.readFileSync(NEWS_POOL_FILE, 'utf-8'));
        const now = Date.now();

        premiumNewsPool.length = 0;
        for (const n of (data.premium ?? [])) {
            const expiresAt = new Date(n.expiresAt);
            if (expiresAt.getTime() <= now) continue;
            premiumNewsPool.push({
                ...n,
                buyers:      new Set(n.buyers),
                generatedAt: new Date(n.generatedAt),
                expiresAt,
            });
        }

        freeNewsPool.length = 0;
        freeNewsPool.push(...(data.free ?? []));

        serverLog(`[INFO] News pool loaded: ${premiumNewsPool.length} premium, ${freeNewsPool.length} free`);
    } catch (err) {
        serverLog(`[ERROR] Failed to load news pool: ${err}`);
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

function getPremiumNewsList() {
    return premiumNewsPool
        .filter(n => n.expiresAt.getTime() > Date.now())
        .sort((a, b) => b.tier - a.tier);
}

function getPremiumNewsById(id) {
    return premiumNewsPool.find(n => n.id === id) ?? null;
}

function hasBought(userId, newsId) {
    const item = premiumNewsPool.find(n => n.id === newsId);
    return item ? item.buyers.has(userId) : false;
}

// Mark as bought and return the full news content object.
function purchaseNews(userId, newsId) {
    const item = premiumNewsPool.find(n => n.id === newsId);
    if (!item) return null;
    item.buyers.add(userId);
    saveNewsPool();
    return item;
}

function getBoughtNews(userId) {
    return premiumNewsPool
        .filter(n => n.buyers.has(userId) && n.expiresAt.getTime() > Date.now())
        .sort((a, b) => b.tier - a.tier);
}

function getFreeNews() {
    return freeNewsPool.map(n => {
        const stockName = getStockName(n.ticker);
        const phrase = n.displayDirection === 'up' ? randomPick(UP_PHRASES) : randomPick(DOWN_PHRASES);
        const icon   = n.displayDirection === 'up' ? '📈' : '📉';
        const tag    = n.tier === 1 ? '(시장 소문)' : '(시장 정보)';
        return `${icon} ${stockName} [${n.ticker}] — ${phrase} ${tag}`;
    });
}

module.exports = {
    detectAndGenerateNews,
    loadNewsPool,
    getPremiumNewsList,
    getPremiumNewsById,
    hasBought,
    purchaseNews,
    getFreeNews,
    getBoughtNews,
};
