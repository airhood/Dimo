'use strict';

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    AttachmentBuilder,
} = require('discord.js');
const AutoTrade = require('../schemas/auto_trade');
const { getUserState } = require('../database');
const { validateScript } = require('../systems/auto_trade_interpreter');
const { runBacktest } = require('../systems/backtest_engine');
const { INITIAL_BALANCE } = require('../setting');
const moment = require('moment-timezone');

const MAX_LOGS = 50;
const SCRIPT_PREVIEW_LEN = 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('자동매매')
        .setDescription('자동매매 스크립트를 등록하고 관리합니다.')
        .addSubcommand((sub) =>
            sub.setName('등록')
                .setDescription('자동매매 스크립트를 등록합니다. (모달 팝업)')
        )
        .addSubcommand((sub) =>
            sub.setName('보기')
                .setDescription('현재 등록된 자동매매 스크립트를 표시합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('실행')
                .setDescription('자동매매 스케줄러를 시작합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('정지')
                .setDescription('자동매매 스케줄러를 정지합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('로그')
                .setDescription('자동매매 PRINT() 로그를 표시합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('매매기록')
                .setDescription('자동매매로 체결된 거래 내역을 표시합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('삭제')
                .setDescription('등록된 자동매매 스크립트를 삭제합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('보안')
                .setDescription('자동매매 응답을 나만 볼 수 있도록 설정합니다.')
                .addBooleanOption((opt) =>
                    opt.setName('활성화')
                        .setDescription('활성화하면 모든 자동매매 응답이 나에게만 보입니다.')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('도움말')
                .setDescription('DimoScript 문법 및 함수 목록을 표시합니다.')
        )
        .addSubcommand((sub) =>
            sub.setName('백테스팅')
                .setDescription('등록된 스크립트를 역사적 데이터로 시뮬레이션합니다.')
                .addStringOption((opt) =>
                    opt.setName('기간')
                        .setDescription('백테스팅 기간')
                        .setRequired(true)
                        .addChoices(
                            { name: '1시간',  value: '1'  },
                            { name: '3시간',  value: '3'  },
                            { name: '6시간',  value: '6'  },
                            { name: '12시간', value: '12' },
                            { name: '24시간', value: '24' },
                            { name: '48시간', value: '48' },
                        )
                )
                .addIntegerOption((opt) =>
                    opt.setName('시작잔액')
                        .setDescription('시뮬레이션 시작 잔액 (기본: 1,000,000원)')
                        .setRequired(false)
                        .setMinValue(100000)
                        .setMaxValue(1000000000)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === '도움말') {
            const embed1 = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('DimoScript 도움말 (1/4) — 문법')
                .addFields(
                    {
                        name: '📋 기본 명령어',
                        value: [
                            '`/자동매매 등록` — 스크립트 작성 (모달)',
                            '`/자동매매 보기` — 등록된 스크립트 확인',
                            '`/자동매매 실행` — 1분마다 자동 실행 ON',
                            '`/자동매매 정지` — 자동 실행 OFF',
                            '`/자동매매 로그` — PRINT() 출력 기록',
                        ].join('\n'),
                    },
                    {
                        name: '✏️ 문법',
                        value: [
                            '```',
                            '# 주석',
                            'x = 표현식          # 변수 할당',
                            '산술: + - * /',
                            '비교: < > <= >= == !=',
                            '논리: AND  OR  NOT',
                            '',
                            'IF 조건 THEN',
                            '  ...',
                            'ELSE IF 조건 THEN',
                            '  ...',
                            'ELSE',
                            '  ...',
                            'END',
                            '```',
                        ].join('\n'),
                    },
                    {
                        name: '📐 수량 규칙 (BUY·SELL·ETF 등)',
                        value: [
                            '`0` → 올인 / 전량 매도',
                            '`0.1 ~ 0.9` → 잔액 또는 보유량의 비율 (예: `0.5` = 50%)',
                            '`1 이상` → 정수 수량 (소숫점 입력 시 내림)',
                        ].join('\n'),
                    },
                );

            const embed2 = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('DimoScript 도움말 (2/4) — 조회 함수')
                .setDescription('값을 반환하는 함수입니다. 변수에 대입하거나 조건식에 바로 사용할 수 있습니다.')
                .addFields(
                    {
                        name: '📈 시세',
                        value: [
                            '`PRICE("종목코드")` — 주식 현재가',
                            '`FUTURE_PRICE("종목코드")` — 선물 현재가',
                            '`ETF_PRICE("ETF_ID")` — ETF 현재가',
                            '`INDEX()` — DISDAQ 주가지수 (기본값)',
                            '`INDEX("DISDAQ")` — 지수명 지정 (현재 DISDAQ만 지원)',
                        ].join('\n'),
                    },
                    {
                        name: '💰 계좌 조회',
                        value: [
                            '`BALANCE()` — 잔액',
                            '`HOLDINGS("종목")` — 주식 보유량',
                            '`SHORT_HOLDINGS("종목")` — 공매도 보유량',
                            '`FUTURES_COUNT("종목")` — 선물 포지션 수',
                            '`OPTIONS_COUNT("종목", "call"/"put")` — 옵션 포지션 수',
                            '`ETF_HOLDINGS("ETF_ID")` — ETF 보유량',
                            '`FUND_UNITS("펀드명")` — 펀드 보유 좌수',
                            '`LOANS_COUNT()` — 활성 대출 수',
                        ].join('\n'),
                    },
                );

            const embed3 = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('DimoScript 도움말 (3/4) — 거래 함수 & 예시')
                .addFields(
                    {
                        name: '📊 주식 / 선물 / 옵션',
                        value: [
                            '`BUY("종목", 수량)` — 주식 매수',
                            '`SELL("종목", 수량)` — 주식 매도',
                            '`SHORT("종목", 수량)` — 공매도',
                            '`FUTURE_LONG("종목", 수량, 레버리지)` — 선물 롱',
                            '`FUTURE_SHORT("종목", 수량, 레버리지)` — 선물 숏',
                            '`FUTURE_CLOSE(포지션번호)` — 선물 청산 (1부터)',
                            '`OPTION_BUY_CALL("종목", 수량, 행사가)` — 콜옵션 매수',
                            '`OPTION_BUY_PUT("종목", 수량, 행사가)` — 풋옵션 매수',
                            '`OPTION_SELL_CALL("종목", 수량, 행사가)` — 콜옵션 매도',
                            '`OPTION_SELL_PUT("종목", 수량, 행사가)` — 풋옵션 매도',
                            '`OPTION_CLOSE(포지션번호)` — 옵션 청산 (1부터)',
                        ].join('\n'),
                    },
                    {
                        name: '🏦 ETF / 은행 / 펀드',
                        value: [
                            '`ETF_BUY("ETF_ID", 수량)` — ETF 매수',
                            '`ETF_SELL("ETF_ID", 수량)` — ETF 매도',
                            '`LOAN(금액, 일수, "고정금리"/"변동금리")` — 대출',
                            '`LOAN_REPAY(대출번호)` — 대출 상환 (1부터)',
                            '`DEPOSIT(금액, 일수)` — 정기예금',
                            '`SAVINGS(금액, 일수)` — 자유적금',
                            '`FUND_BUY("펀드명", 금액)` — 펀드 매수',
                            '`FUND_SELL("펀드명", 좌수)` — 펀드 매도',
                        ].join('\n'),
                    },
                    {
                        name: '💡 예시 코드',
                        value: [
                            '```',
                            '# 삼성전자 자동매매',
                            'price = PRICE("005930")',
                            'held = HOLDINGS("005930")',
                            '',
                            'IF price < 50000 AND held == 0 THEN',
                            '    BUY("005930", 0.5)',
                            '    PRINT("매수: " + price)',
                            'ELSE IF price > 70000 AND held > 0 THEN',
                            '    SELL("005930", 0)',
                            '    PRINT("전량 매도")',
                            'END',
                            '```',
                        ].join('\n'),
                    },
                );

            const embed4 = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('DimoScript 도움말 (4/4) — 출력 / 알림 / DM')
                .addFields(
                    {
                        name: '🖨️ 출력',
                        value: '`PRINT("메시지")` — 로그에 기록 (`/자동매매 로그`에서 확인)',
                    },
                    {
                        name: '🔔 알림 등록',
                        value: [
                            '`NOTIFY_POSITION(종류, 포지션번호, 목표PnL, 방향)` — 포지션 알림 등록',
                            '`NOTIFY_ACCOUNT(목표PnL, 방향)` — 계좌 전체 PnL 알림 등록',
                            '',
                            '**종류**: `"stock"` / `"future"` / `"option"` / `"fund"`',
                            '**방향**: `"above"` (이상) / `"below"` (이하)',
                            '',
                            '예시: `NOTIFY_POSITION("future", 1, 500000, "above")`',
                            '→ 선물 1번 포지션 PnL이 50만원 이상일 때 알림',
                        ].join('\n'),
                    },
                    {
                        name: '✉️ DM 전송',
                        value: [
                            '`DM("메시지")` — 자신에게 Discord 다이렉트 메시지 전송',
                            '',
                            '예시:',
                            '```',
                            'IF BALANCE() < 100000 THEN',
                            '    DM("잔액이 10만원 미만입니다!")',
                            'END',
                            '```',
                        ].join('\n'),
                    },
                );

            return interaction.reply({
                embeds: [embed1, embed2, embed3, embed4],
            });
        }

        // Resolve current accountKey from user's State
        const stateResult = await getUserState(interaction.user.id);
        if (stateResult.state === 'error') {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xEA4144)
                        .setTitle('서버 오류')
                        .setDescription('사용자 상태를 불러오는 중 오류가 발생했습니다.')
                        .setTimestamp()
                ],
                ephemeral: true,
            });
        }

        const currentAccount = stateResult.data.state.currentAccount;
        const accountKey = currentAccount;
        const accountLabel = accountKey === '@self'
            ? '개인 계정'
            : `펀드: ${accountKey.replace('@fund_', '')}`;

        if (sub === '등록') {
            const modal = new ModalBuilder()
                .setCustomId(`auto_trade_register-${interaction.user.id}-${encodeURIComponent(accountKey)}`)
                .setTitle(`자동매매 스크립트 등록 [${accountLabel}]`);

            const scriptInput = new TextInputBuilder()
                .setCustomId('script')
                .setLabel('DimoScript 코드 (최대 4000자)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(4000)
                .setPlaceholder(
                    '예시:\nprice = PRICE("삼성전자")\nIF price < 50000 THEN\n    BUY("삼성전자", 10)\nEND'
                );

            modal.addComponents(new ActionRowBuilder().addComponents(scriptInput));
            return interaction.showModal(modal);
        }

        if (sub === '보기') {
            const entry = await AutoTrade.findOne({ userId: interaction.user.id, accountKey });
            const priv = entry?.privateMode ?? false;
            if (!entry || !entry.script) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE57E22)
                            .setTitle('자동매매 스크립트 없음')
                            .setDescription(`**[${accountLabel}]**에 등록된 스크립트가 없습니다.\n\`/자동매매 등록\`으로 스크립트를 등록하세요.`)
                    ],
                    ephemeral: priv,
                });
            }

            const preview = entry.script.length > SCRIPT_PREVIEW_LEN
                ? entry.script.slice(0, SCRIPT_PREVIEW_LEN) + '\n...(생략)'
                : entry.script;

            const lastRun = entry.lastRunAt
                ? moment(entry.lastRunAt).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')
                : '없음';

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle('자동매매 스크립트')
                        .setDescription(`**계정:** ${accountLabel}\n**상태:** ${entry.isRunning ? '실행 중' : '정지됨'}\n**마지막 실행:** ${lastRun}\n\`\`\`\n${preview}\n\`\`\``)
                        .setTimestamp()
                ],
                ephemeral: priv,
            });
        }

        if (sub === '실행') {
            const entry = await AutoTrade.findOne({ userId: interaction.user.id, accountKey });
            const priv = entry?.privateMode ?? false;
            if (!entry || !entry.script) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('스크립트 없음')
                            .setDescription('먼저 `/자동매매 등록`으로 스크립트를 등록하세요.')
                    ],
                    ephemeral: priv,
                });
            }
            if (entry.isRunning) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE57E22)
                            .setTitle('이미 실행 중')
                            .setDescription('자동매매가 이미 실행 중입니다.')
                    ],
                    ephemeral: priv,
                });
            }
            entry.isRunning = true;
            await entry.save();
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setTitle('자동매매 시작')
                        .setDescription(`**[${accountLabel}]** 자동매매를 시작했습니다.\n1분마다 스크립트가 실행됩니다.`)
                        .setTimestamp()
                ],
                ephemeral: priv,
            });
        }

        if (sub === '정지') {
            const entry = await AutoTrade.findOne({ userId: interaction.user.id, accountKey });
            const priv = entry?.privateMode ?? false;
            if (!entry || !entry.script) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('스크립트 없음')
                            .setDescription('등록된 스크립트가 없습니다.')
                    ],
                    ephemeral: priv,
                });
            }
            if (!entry.isRunning) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE57E22)
                            .setTitle('이미 정지됨')
                            .setDescription('자동매매가 이미 정지 상태입니다.')
                    ],
                    ephemeral: priv,
                });
            }
            entry.isRunning = false;
            await entry.save();
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle('자동매매 정지')
                        .setDescription(`**[${accountLabel}]** 자동매매를 정지했습니다.`)
                        .setTimestamp()
                ],
                ephemeral: priv,
            });
        }

        if (sub === '로그') {
            const entry = await AutoTrade.findOne({ userId: interaction.user.id, accountKey });
            const priv = entry?.privateMode ?? false;
            if (!entry || entry.logs.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE57E22)
                            .setTitle('로그 없음')
                            .setDescription('자동매매 로그가 없습니다.')
                    ],
                    ephemeral: priv,
                });
            }

            const recentLogs = entry.logs.slice(-MAX_LOGS);
            const logLines = recentLogs.map((l) => {
                const ts = moment(l.timestamp).tz('Asia/Seoul').format('MM-DD HH:mm');
                return `\`${ts}\` ${l.message}`;
            });

            // Discord embed description limit: 4096 chars
            let description = logLines.join('\n');
            if (description.length > 4000) {
                description = description.slice(-4000);
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x9B59B6)
                        .setTitle(`자동매매 로그 [${accountLabel}]`)
                        .setDescription(description)
                        .setTimestamp()
                ],
                ephemeral: priv,
            });
        }

        if (sub === '매매기록') {
            const entry = await AutoTrade.findOne({ userId: interaction.user.id, accountKey });
            const priv = entry?.privateMode ?? false;
            if (!entry || !entry.trades || entry.trades.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE57E22)
                            .setTitle('매매기록 없음')
                            .setDescription('자동매매로 체결된 거래 내역이 없습니다.')
                    ],
                    ephemeral: priv,
                });
            }

            const recentTrades = entry.trades.slice(-50);
            const tradeLines = recentTrades.map((t) => {
                const ts = moment(t.timestamp).tz('Asia/Seoul').format('MM-DD HH:mm');
                const icon = t.success ? '✅' : '❌';
                return `\`${ts}\` ${icon} ${t.summary}`;
            });

            let description = tradeLines.join('\n');
            if (description.length > 4000) {
                description = description.slice(-4000);
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setTitle(`자동매매 매매기록 [${accountLabel}]`)
                        .setDescription(description)
                        .setFooter({ text: `최근 ${recentTrades.length}건 표시` })
                        .setTimestamp()
                ],
                ephemeral: priv,
            });
        }

        if (sub === '삭제') {
            const entry = await AutoTrade.findOne({ userId: interaction.user.id, accountKey });
            const priv = entry?.privateMode ?? false;
            if (!entry || !entry.script) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE57E22)
                            .setTitle('스크립트 없음')
                            .setDescription(`**[${accountLabel}]**에 등록된 스크립트가 없습니다.`)
                    ],
                    ephemeral: priv,
                });
            }
            await AutoTrade.updateOne(
                { userId: interaction.user.id, accountKey },
                {
                    $unset: { script: '', lastRunAt: '', lastError: '' },
                    $set: { isRunning: false, logs: [], trades: [] },
                },
                { runValidators: false }
            );
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle('자동매매 스크립트 삭제 완료')
                        .setDescription(`**[${accountLabel}]** 스크립트 및 모든 기록이 삭제되었습니다.`)
                        .setTimestamp()
                ],
                ephemeral: priv,
            });
        }

        if (sub === '백테스팅') {
            const hours = parseInt(interaction.options.getString('기간'), 10);
            const startBalance = interaction.options.getInteger('시작잔액') ?? INITIAL_BALANCE;

            const entry = await AutoTrade.findOne({ userId: interaction.user.id, accountKey });
            const priv = entry?.privateMode ?? false;

            if (!entry || !entry.script) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xE57E22)
                            .setTitle('스크립트 없음')
                            .setDescription(`**[${accountLabel}]**에 등록된 스크립트가 없습니다.\n\`/자동매매 등록\`으로 스크립트를 먼저 등록하세요.`)
                    ],
                    ephemeral: priv,
                });
            }

            await interaction.deferReply({ ephemeral: priv });

            const result = await runBacktest(entry.script, { hours, startBalance });

            if (!result.ok) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle('백테스팅 실패')
                            .setDescription(result.error)
                    ],
                });
            }

            const sign = result.returnRate >= 0 ? '+' : '';
            const mddStr = result.mdd > 0 ? `-${result.mdd.toFixed(2)}%` : '0.00%';
            const embedColor = result.returnRate >= 0 ? 0x2ecc71 : 0xe74c3c;

            // Recent trades block (up to 10)
            const recentTrades = result.trades.slice(-10);
            const tradeBlock = recentTrades.length > 0
                ? recentTrades.map((t) => `${t.success ? '✅' : '❌'} ${t.summary}`).join('\n')
                : '거래 없음';

            const summaryEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🔬 백테스팅 결과 [${hours}시간]`)
                .addFields(
                    { name: '시작 잔액',     value: `${startBalance.toLocaleString()}원`,                 inline: true },
                    { name: '최종 자산가치', value: `${Math.round(result.finalValue).toLocaleString()}원`, inline: true },
                    { name: '수익률',        value: `${sign}${result.returnRate.toFixed(2)}%`,             inline: true },
                    { name: '최대 낙폭',     value: mddStr,                                               inline: true },
                    { name: '총 거래 횟수',  value: `${result.tradeCount}회  (성공 ${result.successCount} / 실패 ${result.failCount})`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    {
                        name: `최근 거래 ${recentTrades.length}건`,
                        value: `\`\`\`\n${tradeBlock.slice(0, 1000)}\n\`\`\``,
                        inline: false,
                    },
                )
                .setTimestamp()
                .setFooter({ text: `[${accountLabel}] | 백테스팅은 실제 거래가 아닙니다.` });

            if (result.chartBuffer) {
                const attachment = new AttachmentBuilder(result.chartBuffer, { name: 'backtest_chart.png' });
                summaryEmbed.setImage('attachment://backtest_chart.png');
                return interaction.editReply({ embeds: [summaryEmbed], files: [attachment] });
            }

            return interaction.editReply({ embeds: [summaryEmbed] });
        }

        if (sub === '보안') {
            const enable = interaction.options.getBoolean('활성화');
            await AutoTrade.updateOne(
                { userId: interaction.user.id, accountKey },
                { $set: { privateMode: enable } },
                { upsert: true, runValidators: false }
            );
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(enable ? 0x9B59B6 : 0x2ecc71)
                        .setTitle(enable ? '🔒 보안 모드 활성화' : '🔓 보안 모드 비활성화')
                        .setDescription(enable
                            ? `**[${accountLabel}]** 자동매매 응답이 이제 **나에게만** 표시됩니다.`
                            : `**[${accountLabel}]** 자동매매 응답이 이제 **채널에 공개**됩니다.`)
                        .setTimestamp()
                ],
                ephemeral: true,
            });
        }
    },
};
