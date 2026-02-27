const crypto = require('crypto');
const axios = require('axios');

const FACE_VALUE = 1000000; // 액면가 100만원

// 수익률 커브에 표시할 만기 전체
const CURVE_MATURITIES = [3, 7, 14, 21];
// 매수 가능한 만기
const TRADEABLE_MATURITIES = [3, 7, 14, 21];

// 만기별 OU(오른슈타인-울렌베크) 시뮬레이션 파라미터
//   termPremium : 기준금리 대비 기간 프리미엄 (%)
//   kappa       : 기준금리로의 평균회귀 속도 (작을수록 자유롭게 드리프트)
//   sigma       : 분 단위 변동성 (클수록 주식처럼 활발하게 움직임)
const MATURITY_PARAMS = {
    3:  { termPremium: 0.10, kappa: 0.08, sigma: 0.030 },
    7:  { termPremium: 0.25, kappa: 0.06, sigma: 0.040 },
    14: { termPremium: 0.50, kappa: 0.04, sigma: 0.055 },
    21: { termPremium: 0.75, kappa: 0.025, sigma: 0.065 },
};

const MAX_HISTORY = 240; // 240분(4시간) 보관

// in-memory 상태
let currentYields = {};       // { 3: %, 7: %, 14: %, 21: % }
let yieldHistory  = [];       // [{ ts, yields:{3,7,14,21} }, ...]

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────

function _getBaseRate() {
    const d = new Date();
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const num  = parseInt(hash.substring(0, 8), 16);
    return Number(((num / 0xFFFFFFFF) * 4 + 1).toFixed(2));
}

// 표준 정규 (Box-Muller)
function _randn() {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── 초기화 / 틱 ───────────────────────────────────────────────────────────

function _initBondYields() {
    const base = _getBaseRate();

    // 균형점(기준금리 + 기간 프리미엄)에서 시작
    const temp = {};
    for (const mat of CURVE_MATURITIES) {
        temp[mat] = Number((base + MATURITY_PARAMS[mat].termPremium).toFixed(3));
    }

    const now = Date.now();

    // MAX_HISTORY 스텝 선행 시뮬레이션 → 히스토리 채우기
    for (let step = 0; step < MAX_HISTORY; step++) {
        const ts = now - (MAX_HISTORY - step) * 60 * 1000;
        yieldHistory.push({ ts, yields: { ...temp } });

        for (const mat of CURVE_MATURITIES) {
            const { termPremium, kappa, sigma } = MATURITY_PARAMS[mat];
            const mu = base + termPremium;
            const dy = kappa * (mu - temp[mat]) + sigma * _randn();
            temp[mat] = Math.min(20.0, Math.max(0.1, Number((temp[mat] + dy).toFixed(3))));
        }
    }

    // 현재 상태 기록
    currentYields = { ...temp };
    yieldHistory.push({ ts: now, yields: { ...currentYields } });
}

function tickBondYields() {
    const base = _getBaseRate();
    for (const mat of CURVE_MATURITIES) {
        const { termPremium, kappa, sigma } = MATURITY_PARAMS[mat];
        const mu = base + termPremium;
        const y  = currentYields[mat];
        // OU step: dy = κ(μ - y) + σ * ε
        const dy = kappa * (mu - y) + sigma * _randn();
        currentYields[mat] = Math.min(20.0, Math.max(0.1, Number((y + dy).toFixed(3))));
    }
    yieldHistory.push({ ts: Date.now(), yields: { ...currentYields } });
    if (yieldHistory.length > MAX_HISTORY) yieldHistory.shift();
}

// 모듈 로드 시 자동 시작
_initBondYields();
setInterval(tickBondYields, 60 * 1000);

// ── 조회 함수 ──────────────────────────────────────────────────────────────

function getBondYield(maturityDays = 3) {
    return currentYields[maturityDays] ?? currentYields[3];
}

function getYieldCurve() {
    return CURVE_MATURITIES.map(m => ({ maturity: m, yield: currentYields[m] }));
}

// ── 채권 가격 계산 ─────────────────────────────────────────────────────────

function calcMaturityValue(faceValue, couponRate, maturityDays) {
    return Math.round(faceValue * (1 + couponRate / 100 * maturityDays / 365));
}

// NPV 방식 중도 매각가 (1매 기준)
function calcMarketPrice(faceValue, couponRate, maturityDays, daysHeld, currentYield) {
    const remaining = maturityDays - daysHeld;
    if (remaining <= 0) return calcMaturityValue(faceValue, couponRate, maturityDays);
    const matVal = faceValue * (1 + couponRate / 100 * maturityDays / 365);
    return Math.round(matVal / (1 + currentYield / 100 * remaining / 365));
}

// ── 차트 생성 ──────────────────────────────────────────────────────────────

// 수익률 추이 차트 (시계열, 최근 120분)
async function generateBondChart() {
    const raw  = yieldHistory.slice(-120);
    const last = raw.length - 1;

    const series = TRADEABLE_MATURITIES.map(mat => ({
        name: `${mat}일물`,
        data: raw.map((snap, i) => [i - last, snap.yields[mat]]),
    }));

    const chartConfig = {
        chart: { type: 'line' },
        title: { text: '국채 수익률 추이 (최근 2시간)' },
        dataLabels: { enabled: false },
        stroke: { width: 2, curve: 'smooth' },
        series,
        xaxis: {
            type: 'linear',
            tickAmount: 8,
            title: { text: '분' },
        },
        yaxis: {
            title: { text: '수익률 (%)' },
            decimalsInFloat: 2,
        },
        legend: { show: true },
        colors: ['#4A90D9', '#27AE60', '#E74C3C', '#F39C12'],
    };

    const response = await axios.post(
        'https://quickchart.io/apex-charts/render',
        { config: chartConfig, width: 700, height: 350 },
        { responseType: 'arraybuffer', timeout: 15000 },
    );
    return Buffer.from(response.data);
}

// 수익률 커브 스냅샷 차트
async function generateYieldCurveChart() {
    const curve = getYieldCurve();
    const categories = curve.map(c => `${c.maturity}일`);
    const values     = curve.map(c => c.yield);

    const chartConfig = {
        chart: { type: 'line' },
        title: { text: '국채 수익률 커브' },
        dataLabels: { enabled: true },
        stroke: { width: 2, curve: 'smooth' },
        markers: { size: 5 },
        series: [{ name: '수익률', data: values }],
        xaxis: {
            type: 'category',
            categories,
            title: { text: '만기' },
        },
        yaxis: {
            title: { text: '수익률 (%)' },
            decimalsInFloat: 2,
        },
        legend: { show: false },
        colors: ['#E74C3C'],
    };

    const response = await axios.post(
        'https://quickchart.io/apex-charts/render',
        { config: chartConfig, width: 700, height: 350 },
        { responseType: 'arraybuffer', timeout: 15000 },
    );
    return Buffer.from(response.data);
}

module.exports = {
    FACE_VALUE,
    TRADEABLE_MATURITIES,
    CURVE_MATURITIES,
    getBondYield,
    getYieldCurve,
    calcMaturityValue,
    calcMarketPrice,
    generateBondChart,
    generateYieldCurveChart,
};
