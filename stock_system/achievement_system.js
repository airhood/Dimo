const { calculateAssetValue } = require('./credit_system');

// 각 업적은 name (표시명), description (설명), check(context) 함수로 구성됩니다.
// context: { level, asset, logCounts, totalTransactions }
// - level: 현재 레벨 (Number)
// - asset: 개인 Asset 도큐먼트 (stocks, futures, options 등 포함)
// - logCounts: { type: count } 형태의 거래 내역 집계
// - totalTransactions: 총 거래 횟수

const ACHIEVEMENTS = [

    // ===== 레벨 업적 =====
    {
        name: '새싹 투자자',
        description: '레벨 5를 달성하였습니다.',
        check: ({ level }) => level >= 5,
    },
    {
        name: '성장하는 투자자',
        description: '레벨 10을 달성하였습니다.',
        check: ({ level }) => level >= 10,
    },
    {
        name: '전문 투자자',
        description: '레벨 20을 달성하였습니다.',
        check: ({ level }) => level >= 20,
    },
    {
        name: '투자의 달인',
        description: '레벨 50을 달성하였습니다.',
        check: ({ level }) => level >= 50,
    },

    // ===== 자산 업적 (순자산 기준) =====
    {
        name: '첫 수익',
        description: '순자산 150만원을 달성하였습니다.',
        check: ({ asset }) => {
            try { return calculateAssetValue(asset) >= 1_500_000; }
            catch { return false; }
        },
    },
    {
        name: '천만 클럽',
        description: '순자산 1,000만원을 달성하였습니다.',
        check: ({ asset }) => {
            try { return calculateAssetValue(asset) >= 10_000_000; }
            catch { return false; }
        },
    },
    {
        name: '억대 자산가',
        description: '순자산 1억원을 달성하였습니다.',
        check: ({ asset }) => {
            try { return calculateAssetValue(asset) >= 100_000_000; }
            catch { return false; }
        },
    },
    {
        name: '10억 투자자',
        description: '순자산 10억원을 달성하였습니다.',
        check: ({ asset }) => {
            try { return calculateAssetValue(asset) >= 1_000_000_000; }
            catch { return false; }
        },
    },

    // ===== 주식 업적 =====
    {
        name: '첫 주식 매수',
        description: '주식을 처음으로 매수하였습니다.',
        check: ({ logCounts }) => (logCounts['stock_buy'] || 0) >= 1,
    },
    {
        name: '다각화 포트폴리오',
        description: '3개 이상의 종목을 동시에 보유하였습니다.',
        check: ({ asset }) => {
            const tickers = new Set(asset.stocks.map(s => s.ticker));
            return tickers.size >= 3;
        },
    },
    {
        name: '공매도 도전',
        description: '공매도를 처음으로 경험하였습니다.',
        check: ({ logCounts }) => (logCounts['stock_short_sell'] || 0) >= 1,
    },

    // ===== 파생상품 업적 =====
    {
        name: '선물 투자자',
        description: '선물 상품에 처음으로 투자하였습니다.',
        check: ({ logCounts }) =>
            (logCounts['future_long'] || 0) + (logCounts['future_short'] || 0) >= 1,
    },
    {
        name: '옵션 투자자',
        description: '옵션 상품에 처음으로 투자하였습니다.',
        check: ({ logCounts }) =>
            (logCounts['call_option_buy'] || 0) +
            (logCounts['call_option_sell'] || 0) +
            (logCounts['put_option_buy'] || 0) +
            (logCounts['put_option_sell'] || 0) >= 1,
    },
    {
        name: '바이너리 도전자',
        description: '바이너리 옵션을 5회 이상 거래하였습니다.',
        check: ({ logCounts }) => (logCounts['binary_option'] || 0) >= 5,
    },

    // ===== 대출 업적 =====
    {
        name: '신용 우량자',
        description: '대출을 기한 내에 상환한 경험이 있습니다.',
        check: ({ asset }) => asset.loanHistory.some(l => l.onTime),
    },
    {
        name: '레버리지 마스터',
        description: '대출을 10회 이상 이용하였습니다.',
        check: ({ logCounts }) => (logCounts['loan'] || 0) >= 10,
    },

    // ===== 펀드 업적 =====
    {
        name: '펀드 투자자',
        description: '펀드에 처음으로 투자하였습니다.',
        check: ({ logCounts }) => (logCounts['fund_invest'] || 0) >= 1,
    },
    {
        name: '펀드 매니저',
        description: '펀드를 직접 개설하였습니다.',
        check: ({ logCounts }) => (logCounts['fund_create'] || 0) >= 1,
    },

    // ===== 거래 횟수 업적 =====
    {
        name: '활발한 거래자',
        description: '총 10회 이상 거래를 진행하였습니다.',
        check: ({ totalTransactions }) => totalTransactions >= 10,
    },
    {
        name: '거래 전문가',
        description: '총 50회 이상 거래를 진행하였습니다.',
        check: ({ totalTransactions }) => totalTransactions >= 50,
    },
    {
        name: '마스터 트레이더',
        description: '총 100회 이상 거래를 진행하였습니다.',
        check: ({ totalTransactions }) => totalTransactions >= 100,
    },

    // ===== 특수 업적 =====
    {
        name: '올라운더',
        description: '주식, 선물, 옵션, 펀드를 모두 거래해보았습니다.',
        check: ({ logCounts }) =>
            (logCounts['stock_buy'] || 0) >= 1 &&
            (logCounts['future_long'] || 0) + (logCounts['future_short'] || 0) >= 1 &&
            (logCounts['call_option_buy'] || 0) +
            (logCounts['call_option_sell'] || 0) +
            (logCounts['put_option_buy'] || 0) +
            (logCounts['put_option_sell'] || 0) >= 1 &&
            (logCounts['fund_invest'] || 0) >= 1,
    },
    {
        name: '하이리스크 하이리턴',
        description: '선물 또는 옵션을 10회 이상 거래하였습니다.',
        check: ({ logCounts }) =>
            (logCounts['future_long'] || 0) +
            (logCounts['future_short'] || 0) +
            (logCounts['call_option_buy'] || 0) +
            (logCounts['call_option_sell'] || 0) +
            (logCounts['put_option_buy'] || 0) +
            (logCounts['put_option_sell'] || 0) >= 10,
    },
];

module.exports = { ACHIEVEMENTS };
