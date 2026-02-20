const { SlashCommandBuilder, EmbedBuilder, userMention } = require('discord.js');
const { fundAddAdministrator, fundRemoveAdministrator, fundGetAdministrators, fundLogin, fundLogout, fundCreate, getFundInfo, getFundList, fundInvest, fundRedeem } = require('../database');
const { calculateAssetValue } = require('../stock_system/credit_system');

const MIN_INITIAL_AMOUNT = 1_000_000_000; // 10억

module.exports = {
    data: new SlashCommandBuilder()
        .setName('펀드')
        .setDescription('펀드는 여러 투자자의 자금을 모아 다양한 자산에 투자하는 금융 상품입니다.')
        .addSubcommand((subCommand) =>
            subCommand.setName('목록')
                .setDescription('등록된 펀드의 목록을 가져옵니다.')
                .addStringOption((option) =>
                    option.setName('정렬기준')
                        .setDescription('펀드 목록을 정렬할 기준')
                        .addChoices(
                            { name: '수익률(높은순)', value: '수익률(높은순)'},
                            { name: '수익률(낮은순)', value: '수익률(낮은순)'},
                            { name: '등록일(최신순)', value: '등록일(최신순)'},
                            { name: '등록일(오래된순)', value: '등록일(오래된순)'},
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('등록')
                .setDescription('펀드를 등록합니다. 최소 10억원이 필요합니다.')
                .addStringOption((option) =>
                    option.setName('이름')
                        .setDescription('등록할 펀드의 이름')
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option.setName('설명')
                        .setDescription('등록할 펀드의 설명')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('수수료')
                        .setDescription('펀드의 수익에서 받을 수수료의 비율 (%)')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('초기투자금')
                        .setDescription('펀드 창설 시 투자할 금액 (최소 10억원)')
                        .setMinValue(MIN_INITIAL_AMOUNT)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('정보')
                .setDescription('펀드의 정보를 가져옵니다.')
                .addStringOption((option) =>
                    option.setName('이름')
                        .setDescription('펀드의 이름')
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('투자')
                .setDescription('펀드에 투자합니다.')
                .addStringOption((option) =>
                    option.setName('이름')
                        .setDescription('투자할 펀드의 이름')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('금액')
                        .setDescription('투자할 금액 (원)')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand((subCommand) =>
            subCommand.setName('환매')
                .setDescription('펀드 투자금을 환매합니다.')
                .addStringOption((option) =>
                    option.setName('이름')
                        .setDescription('환매할 펀드의 이름')
                        .setRequired(true)
                )
                .addNumberOption((option) =>
                    option.setName('유닛수')
                        .setDescription('환매할 유닛 수')
                        .setMinValue(0.000001)
                        .setRequired(true)
                )
        )
        .addSubcommandGroup((subCommandGroup) =>
            subCommandGroup.setName('관리자')
                .setDescription('펀드의 관리자 페이지')
                .addSubcommand((subCommand) =>
                    subCommand.setName('추가')
                        .setDescription('펀드의 관리자를 추가합니다.')
                        .addStringOption((option) =>
                            option.setName('이름')
                                .setDescription('펀드의 이름')
                                .setRequired(true)
                        )
                        .addUserOption((option) =>
                            option.setName('유저')
                                .setDescription('펀드의 관리자로 등록할 유저')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('삭제')
                        .setDescription('펀드의 관리자를 삭제합니다.')
                        .addStringOption((option) =>
                            option.setName('이름')
                                .setDescription('펀드의 이름')
                                .setRequired(true)
                        )
                        .addIntegerOption((option) =>
                            option.setName('관리자번호')
                                .setDescription('펀드의 관리자에서 제거할 관리자의 번호. (관리자 번호는 **/펀드 관리자목록**을 통해 확인할 수 있습니다)')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('목록')
                        .setDescription('펀드의 관리자 목록을 가져옵니다.')
                        .addStringOption((option) =>
                            option.setName('이름')
                                .setDescription('펀드의 이름')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('로그인')
                        .setDescription('펀드의 관리자로 로그인합니다. (로그인시 모든 거래는 펀드의 명의로 진행됩니다)')
                        .addStringOption((option) =>
                            option.setName('이름')
                                .setDescription('펀드의 이름')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('로그아웃')
                        .setDescription('펀드의 관리자에서 로그아웃합니다. (로그아웃시 모든 거래는 원래대로 본인 명의로 진행됩니다)')
                )
        ),

    async execute(interaction) {
        const subCommandGroup = interaction.options.getSubcommandGroup(false);
        const subCommand = interaction.options.getSubcommand();

        if (subCommandGroup === null) {
            if (subCommand === '목록') {
                const sortingOption = interaction.options.getString('정렬기준');
                const fund_list = await getFundList();

                if (fund_list.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                }

                if (!fund_list.data || fund_list.data.length === 0) {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xE57E22)
                                .setTitle(':bar_chart:  펀드 목록')
                                .setDescription('등록된 펀드가 없습니다.')
                                .setTimestamp()
                        ],
                    });
                    return;
                }

                // Calculate unit price and return rate for each fund
                const fundsWithMetrics = fund_list.data.map(fund => {
                    const assetValue = calculateAssetValue(fund.asset);
                    const unitPrice = fund.total_units > 0 ? assetValue / fund.total_units : 1000;
                    const initialUnitPrice = 1000;
                    const returnRate = ((unitPrice - initialUnitPrice) / initialUnitPrice) * 100;
                    return { fund, assetValue, unitPrice, returnRate };
                });

                let sorted = [...fundsWithMetrics];
                if (sortingOption === '수익률(높은순)') {
                    sorted.sort((a, b) => b.returnRate - a.returnRate);
                } else if (sortingOption === '수익률(낮은순)') {
                    sorted.sort((a, b) => a.returnRate - b.returnRate);
                } else if (sortingOption === '등록일(최신순)') {
                    sorted.sort((a, b) => new Date(b.fund._id.getTimestamp()) - new Date(a.fund._id.getTimestamp()));
                } else if (sortingOption === '등록일(오래된순)') {
                    sorted.sort((a, b) => new Date(a.fund._id.getTimestamp()) - new Date(b.fund._id.getTimestamp()));
                }

                const lines = sorted.map(({ fund, assetValue, unitPrice, returnRate }) => {
                    const asset_str = Math.round(assetValue).toLocaleString();
                    const price_str = Math.round(unitPrice).toLocaleString();
                    const rate_str = returnRate >= 0 ? `+${returnRate.toFixed(2)}` : returnRate.toFixed(2);
                    return `**${fund.name}** | 단가 ${price_str}원 | 수익률 ${rate_str}% | 운용자산 ${asset_str}원`;
                });

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle(':bar_chart:  펀드 목록')
                            .setDescription(lines.join('\n'))
                            .setTimestamp()
                    ],
                });

            } else if (subCommand === '등록') {
                const fundName = interaction.options.getString('이름');
                const description = interaction.options.getString('설명');
                const fee = interaction.options.getInteger('수수료');
                const initialAmount = interaction.options.getInteger('초기투자금');

                if (initialAmount === null || initialAmount < MIN_INITIAL_AMOUNT) {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  초기 투자금 오류')
                                .setDescription(`초기 투자금은 최소 **${MIN_INITIAL_AMOUNT.toLocaleString()}원** 이상이어야 합니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                }

                const result = await fundCreate(interaction.user.id, fundName, description, fee, initialAmount);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'insufficient_balance') {
                    const currentBalance = result.data?.balance;
                    const balanceStr = currentBalance != null ? `${currentBalance.toLocaleString()}원` : '알 수 없음';
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  잔고 부족')
                                .setDescription(`초기 투자금 **${initialAmount.toLocaleString()}원**을 낼 잔고가 부족합니다.\n현재 잔고: **${balanceStr}**`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle(':white_check_mark:  펀드 등록 완료')
                                .addFields(
                                    { name: '이름', value: fundName },
                                    { name: '설명', value: description },
                                    { name: '수수료', value: `${fee}%` },
                                    { name: '초기 투자금', value: `${initialAmount.toLocaleString()}원` },
                                    { name: '초기 단가', value: `1,000원 / 유닛` },
                                )
                                .setTimestamp()
                        ],
                    });
                }

            } else if (subCommand === '정보') {
                const fundName = interaction.options.getString('이름');

                const result = await getFundInfo(fundName);
                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  존재하지 않는 펀드')
                                .setDescription(`**${fundName}** 펀드는 존재하지 않습니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'success') {
                    const fund = result.data;
                    const assetValue = calculateAssetValue(fund.asset);
                    const unitPrice = fund.total_units > 0 ? assetValue / fund.total_units : 1000;
                    const returnRate = ((unitPrice - 1000) / 1000) * 100;
                    const rate_str = returnRate >= 0 ? `+${returnRate.toFixed(2)}` : returnRate.toFixed(2);

                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xF1C40F)
                                .setTitle(':bar_chart:  펀드 정보')
                                .addFields(
                                    { name: '펀드명', value: fund.name },
                                    { name: '설명', value: fund.description },
                                    { name: '수수료', value: `${fund.fee}%` },
                                    { name: '운용자산', value: `${Math.round(assetValue).toLocaleString()}원` },
                                    { name: '현재 단가', value: `${Math.round(unitPrice).toLocaleString()}원 / 유닛` },
                                    { name: '누적 수익률', value: `${rate_str}%` },
                                    { name: '총 발행 유닛', value: `${fund.total_units.toFixed(4)}` },
                                )
                                .setTimestamp()
                        ],
                    });
                }

            } else if (subCommand === '투자') {
                const fundName = interaction.options.getString('이름');
                const amount = interaction.options.getInteger('금액');

                const result = await fundInvest(interaction.user.id, fundName, amount);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'insufficient_balance') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  잔고 부족')
                                .setDescription(`투자금 **${amount.toLocaleString()}원**을 낼 잔고가 부족합니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  존재하지 않는 펀드')
                                .setDescription(`**${fundName}** 펀드는 존재하지 않습니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'success') {
                    const { unitPrice, units } = result.data;
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle(':white_check_mark:  펀드 투자 완료')
                                .addFields(
                                    { name: '펀드명', value: fundName },
                                    { name: '투자금액', value: `${amount.toLocaleString()}원` },
                                    { name: '취득 단가', value: `${Math.round(unitPrice).toLocaleString()}원 / 유닛` },
                                    { name: '취득 유닛', value: `${units.toFixed(4)} 유닛` },
                                )
                                .setTimestamp()
                        ],
                    });
                }

            } else if (subCommand === '환매') {
                const fundName = interaction.options.getString('이름');
                const redeemUnits = interaction.options.getNumber('유닛수');

                const result = await fundRedeem(interaction.user.id, fundName, redeemUnits);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  존재하지 않는 펀드')
                                .setDescription(`**${fundName}** 펀드는 존재하지 않습니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'insufficient_units') {
                    const held = result.data.held;
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  유닛 부족')
                                .setDescription(`보유 유닛이 부족합니다.\n보유: **${held.toFixed(4)} 유닛** / 요청: **${redeemUnits.toFixed(4)} 유닛**`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'success') {
                    const { unitPrice, redeemValue, feeAmount, userReceives } = result.data;
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle(':white_check_mark:  펀드 환매 완료')
                                .addFields(
                                    { name: '펀드명', value: fundName },
                                    { name: '환매 유닛', value: `${redeemUnits.toFixed(4)} 유닛` },
                                    { name: '환매 단가', value: `${Math.round(unitPrice).toLocaleString()}원 / 유닛` },
                                    { name: '환매금액', value: `${Math.round(redeemValue).toLocaleString()}원` },
                                    { name: '수수료', value: `${feeAmount.toLocaleString()}원` },
                                    { name: '수령금액', value: `${userReceives.toLocaleString()}원` },
                                )
                                .setTimestamp()
                        ],
                    });
                }
            }

        } else if (subCommandGroup === '관리자') {
            if (subCommand === '추가') {
                const fundName = interaction.options.getString('이름');
                const administrator = interaction.options.getUser('유저');

                const result = await fundAddAdministrator(interaction.user.id, fundName, administrator.id);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  존재하지 않는 펀드')
                                .setDescription(`**${fundName}** 펀드는 존재하지 않는 펀드입니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle(':white_check_mark:  펀드 관리자 추가 완료')
                                .setDescription(`**${fundName}** 펀드에 ${userMention(administrator.id)}를 관리자로 추가했습니다.`)
                                .setTimestamp()
                        ],
                    });
                }

            } else if (subCommand === '삭제') {
                const fundName = interaction.options.getString('이름');
                const administratorNum = interaction.options.getInteger('관리자번호');

                const result = await fundRemoveAdministrator(interaction.user.id, fundName, administratorNum);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  존재하지 않는 펀드')
                                .setDescription(`**${fundName}** 펀드는 존재하지 않는 펀드입니다.`)
                                .setTimestamp()
                        ],
                    });
                } else if (result.state === 'invalid_admin_num') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  올바르지 않은 관리자 번호')
                                .setDescription(`올바른 관리자 번호가 아닙니다.`)
                                .setTimestamp()
                        ],
                    });
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle(':white_check_mark:  펀드 관리자 삭제 완료')
                                .setDescription(`**${fundName}** 펀드에서 ${userMention(result.data)}를 관리자에서 삭제했습니다.`)
                                .setTimestamp()
                        ],
                    });
                }

            } else if (subCommand === '목록') {
                const fundName = interaction.options.getString('이름');

                const administratorList = await fundGetAdministrators(fundName);

                if (!administratorList || administratorList.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                }

                const list = administratorList.data ?? administratorList;
                const contents = list.map((administrator, i) => {
                    const tag = administrator.isTopAdmin ? ' 👑' : '';
                    return `${i + 1}. ${userMention(administrator.userID)}${tag}`;
                });

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle(`:shield:  펀드 관리자 목록 [${fundName}]`)
                            .setDescription(contents.join('\n'))
                            .setTimestamp()
                    ],
                });

            } else if (subCommand === '로그인') {
                const fundName = interaction.options.getString('이름');

                const result = await fundLogin(interaction.user.id, fundName);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  존재하지 않는 펀드')
                                .setDescription(`**${fundName}** 펀드는 존재하지 않는 펀드입니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'not_admin') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':no_entry:  권한 없음')
                                .setDescription(`**${fundName}** 펀드의 관리자가 아닙니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle(`:white_check_mark:  로그인 성공`)
                                .setDescription(`**${fundName}** 펀드 관리자로 로그인을 성공했습니다.`)
                                .setTimestamp()
                        ],
                    });
                }

            } else if (subCommand === '로그아웃') {
                const result = await fundLogout(interaction.user.id);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle('서버 오류')
                                .setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'not_logged_in') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xEA4144)
                                .setTitle(':x:  로그아웃 실패')
                                .setDescription(`현재 관리자로 로그인한 펀드가 없습니다.`)
                                .setTimestamp()
                        ],
                    });
                    return;
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle(`:white_check_mark:  로그아웃 성공`)
                                .setDescription(`펀드 관리자에서 로그아웃을 성공했습니다.`)
                                .setTimestamp()
                        ],
                    });
                }
            }
        }
    }
}
