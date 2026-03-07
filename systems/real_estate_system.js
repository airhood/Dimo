const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { EmbedBuilder } = require('discord.js');
const { serverLog } = require('../server/server_logger');
const {
    PROPERTY_REGIONS,
    PROPERTY_TYPES,
    PROPERTY_MARKET_MAX,
    PROPERTY_PAYOUT_INTERVAL_DAYS,
    PROPERTY_PRICE_RANGES,
    PROPERTY_RENTAL_YIELD_MIN,
    PROPERTY_RENTAL_YIELD_MAX,
    PROPERTY_LISTING_MIN_DAYS,
    PROPERTY_LISTING_MAX_DAYS,
} = require('../setting');
const User = require('../schemas/user');
const Asset = require('../schemas/asset');

const MARKET_FILE = path.join(__dirname, '../data/property_market.json');
const RENTAL_STATE_FILE = path.join(__dirname, '../data/rental_state.json');
const PRICE_INDEX_FILE = path.join(__dirname, '../data/property_price_index.json');

// 일별 변동폭: -1.5% ~ +2.0% (부동산은 완만하게 우상향 편향)
const DAILY_CHANGE_MIN = -0.015;
const DAILY_CHANGE_MAX = 0.020;
// 지수 범위 (0.3 ~ 5.0 사이로 제한)
const INDEX_MIN = 0.3;
const INDEX_MAX = 5.0;

let discordClient = null;

function setClientForRealEstate(client) {
    discordClient = client;
}

// ── 파일 I/O ─────────────────────────────────────────────────────────────────

function ensureDataDir() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function loadMarket() {
    try {
        if (!fs.existsSync(MARKET_FILE)) return [];
        const raw = fs.readFileSync(MARKET_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        serverLog(`[ERROR] Failed to load property_market.json: ${err}`);
        return [];
    }
}

function saveMarket(listings) {
    try {
        ensureDataDir();
        fs.writeFileSync(MARKET_FILE, JSON.stringify(listings, null, 2), 'utf-8');
    } catch (err) {
        serverLog(`[ERROR] Failed to save property_market.json: ${err}`);
    }
}

function loadRentalState() {
    try {
        if (!fs.existsSync(RENTAL_STATE_FILE)) return { lastPayoutDate: null };
        const raw = fs.readFileSync(RENTAL_STATE_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        serverLog(`[ERROR] Failed to load rental_state.json: ${err}`);
        return { lastPayoutDate: null };
    }
}

function saveRentalState(state) {
    try {
        ensureDataDir();
        fs.writeFileSync(RENTAL_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
        serverLog(`[ERROR] Failed to save rental_state.json: ${err}`);
    }
}

// ── 가격 지수 ─────────────────────────────────────────────────────────────────

function makePriceIndexKey(region, type) {
    return `${region}_${type}`;
}

function loadPriceIndex() {
    try {
        if (!fs.existsSync(PRICE_INDEX_FILE)) return {};
        const raw = fs.readFileSync(PRICE_INDEX_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        serverLog(`[ERROR] Failed to load property_price_index.json: ${err}`);
        return {};
    }
}

function savePriceIndex(index) {
    try {
        ensureDataDir();
        fs.writeFileSync(PRICE_INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
    } catch (err) {
        serverLog(`[ERROR] Failed to save property_price_index.json: ${err}`);
    }
}

function initPriceIndex() {
    const index = loadPriceIndex();
    let changed = false;
    for (const region of PROPERTY_REGIONS) {
        for (const type of PROPERTY_TYPES) {
            const key = makePriceIndexKey(region, type);
            if (index[key] === undefined) {
                index[key] = 1.0;
                changed = true;
            }
        }
    }
    if (changed) savePriceIndex(index);
    return index;
}

function getCurrentIndex(region, type) {
    const index = loadPriceIndex();
    const key = makePriceIndexKey(region, type);
    return index[key] ?? 1.0;
}

function updatePriceIndex() {
    const index = loadPriceIndex();
    for (const region of PROPERTY_REGIONS) {
        for (const type of PROPERTY_TYPES) {
            const key = makePriceIndexKey(region, type);
            const current = index[key] ?? 1.0;
            const change = DAILY_CHANGE_MIN + Math.random() * (DAILY_CHANGE_MAX - DAILY_CHANGE_MIN);
            const next = Math.max(INDEX_MIN, Math.min(INDEX_MAX, current * (1 + change)));
            index[key] = parseFloat(next.toFixed(6));
        }
    }
    savePriceIndex(index);
    serverLog('[INFO] Property price index updated');
}

// 특정 부동산의 현재 시세 계산
function calcCurrentValue(prop) {
    const currentIndex = getCurrentIndex(prop.region, prop.type);
    const purchaseIndex = prop.purchaseIndex ?? 1.0;
    return Math.round(prop.purchasePrice * (currentIndex / purchaseIndex));
}

// ── 매물 생성 ─────────────────────────────────────────────────────────────────

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function generateListing() {
    const region = PROPERTY_REGIONS[Math.floor(Math.random() * PROPERTY_REGIONS.length)];
    const type = PROPERTY_TYPES[Math.floor(Math.random() * PROPERTY_TYPES.length)];
    const priceRange = PROPERTY_PRICE_RANGES[region][type];
    const basePrice = randomBetween(priceRange[0], priceRange[1]);

    // 현재 지수 반영해서 실제 매물가 산정
    const currentIdx = getCurrentIndex(region, type);
    const price = Math.round(basePrice * currentIdx);

    const size = randomBetween(10, 60);
    const rentalYield = randomFloat(PROPERTY_RENTAL_YIELD_MIN, PROPERTY_RENTAL_YIELD_MAX);
    const listingDays = randomBetween(PROPERTY_LISTING_MIN_DAYS, PROPERTY_LISTING_MAX_DAYS);

    const now = new Date();
    const listedUntil = new Date(now.getTime() + listingDays * 24 * 60 * 60 * 1000);
    const regionIndex = Math.floor(Math.random() * 100) + 1;

    return {
        propertyId: uuidv4(),
        region,
        type,
        name: `${region} ${type} #${regionIndex}`,
        price,
        rentalYield,
        size,
        listedAt: now.toISOString(),
        listedUntil: listedUntil.toISOString(),
    };
}

function generateMarketListings() {
    let listings = loadMarket();
    const now = new Date();

    listings = listings.filter(l => new Date(l.listedUntil) > now);

    const toAdd = PROPERTY_MARKET_MAX - listings.length;
    for (let i = 0; i < toAdd; i++) {
        listings.push(generateListing());
    }

    saveMarket(listings);
    return listings;
}

function getMarketListings() {
    const listings = loadMarket();
    const now = new Date();
    return listings.filter(l => new Date(l.listedUntil) > now);
}

function getListingById(propertyId) {
    const listings = loadMarket();
    return listings.find(l => l.propertyId === propertyId) || null;
}

function removeListingById(propertyId) {
    let listings = loadMarket();
    listings = listings.filter(l => l.propertyId !== propertyId);
    saveMarket(listings);
}

// ── 임대수익 지급 ─────────────────────────────────────────────────────────────

function isRentalDue(lastPayoutDate) {
    if (!lastPayoutDate) return true;
    const last = new Date(lastPayoutDate);
    const now = new Date();
    const diffMs = now - last;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= PROPERTY_PAYOUT_INTERVAL_DAYS;
}

async function distributeRentalIncome() {
    if (!discordClient) {
        serverLog('[WARN] distributeRentalIncome: discordClient not set');
        return;
    }

    serverLog('[INFO] Starting rental income distribution...');

    try {
        const users = await User.find({}).populate('asset');
        let totalPaid = 0;
        let payoutCount = 0;

        for (const user of users) {
            if (!user.asset) continue;

            const userAsset = user.asset;
            if (!userAsset.properties || userAsset.properties.length === 0) continue;

            let totalRental = 0;
            const rentalBreakdown = [];

            for (const prop of userAsset.properties) {
                // 임대수익은 현재 시세 기준
                const currentValue = calcCurrentValue(prop);
                const rental = Math.round(currentValue * (prop.rentalYield / 100));
                if (rental <= 0) continue;
                totalRental += rental;
                rentalBreakdown.push({ name: prop.name, amount: rental });
            }

            if (totalRental <= 0) continue;

            // 담보대출 이자 차감 (3일치)
            let totalInterest = 0;
            for (const prop of userAsset.properties) {
                if (!prop.mortgage || !prop.mortgage.amount) continue;
                const dailyInterest = prop.mortgage.amount * (prop.mortgage.interestRate / 365);
                const interest = Math.round(dailyInterest * PROPERTY_PAYOUT_INTERVAL_DAYS);
                totalInterest += interest;
            }

            const netIncome = totalRental - totalInterest;

            userAsset.balance += netIncome;
            userAsset.balance = Math.round(userAsset.balance);
            await userAsset.save();

            totalPaid += netIncome;
            payoutCount++;

            try {
                const discordUser = await discordClient.users.fetch(user.userID);
                const breakdownText = rentalBreakdown
                    .map(r => `**${r.name}**: ${r.amount.toLocaleString()}원`)
                    .join('\n');

                const interestText = totalInterest > 0
                    ? `\n대출 이자 차감: -${totalInterest.toLocaleString()}원`
                    : '';

                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle('🏠 부동산 임대수익 지급')
                    .setDescription('보유 부동산에 대한 임대수익이 지급되었습니다.')
                    .addFields(
                        { name: '부동산별 임대수익', value: breakdownText },
                        { name: '순수입', value: `**${netIncome.toLocaleString()}원**${interestText}` },
                    )
                    .setTimestamp();

                await discordUser.send({ embeds: [embed] });
            } catch (dmErr) {
                serverLog(`[WARN] Failed to send rental DM to ${user.userID}: ${dmErr}`);
            }
        }

        serverLog(`[INFO] Rental income distribution complete. ${payoutCount} users paid, total: ${totalPaid.toLocaleString()}원`);
    } catch (err) {
        serverLog(`[ERROR] Error in distributeRentalIncome: ${err}`);
    }
}

async function checkAndDistributeRental() {
    const state = loadRentalState();
    if (!isRentalDue(state.lastPayoutDate)) return;

    await distributeRentalIncome();
    saveRentalState({ lastPayoutDate: new Date().toISOString() });
}

// ── 초기화 ────────────────────────────────────────────────────────────────────

function initRealEstateSystem() {
    serverLog('[INFO] Initializing real estate system...');

    initPriceIndex();
    generateMarketListings();

    // 매일 자정: 지수 업데이트 → 매물 갱신 → 임대수익 체크
    schedule.scheduleJob('0 0 * * *', () => {
        updatePriceIndex();
        generateMarketListings();
        checkAndDistributeRental();
    });

    serverLog('[INFO] Real estate system initialized');
    return true;
}

exports.initRealEstateSystem = initRealEstateSystem;
exports.setClientForRealEstate = setClientForRealEstate;
exports.getMarketListings = getMarketListings;
exports.getListingById = getListingById;
exports.removeListingById = removeListingById;
exports.generateMarketListings = generateMarketListings;
exports.getCurrentIndex = getCurrentIndex;
exports.calcCurrentValue = calcCurrentValue;
