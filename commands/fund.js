const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, userMention } = require('discord.js');
const { fundAddAdministrator, fundRemoveAdministrator, fundGetAdministrators, fundLogin, fundLogout, fundCreate, getFundInfo, getFundList, getUserState, investFund, sellFundInvestment, fundTransferOwnership } = require('../database');
const { calculateAssetValue } = require('../stock_system/credit_system');
const { createCache, saveCache } = require('../cache');
const { v4: uuidv4 } = require('uuid');

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
                .setDescription('펀드를 등록합니다.')
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
                        .setDescription('펀드에 초기 투자할 금액 (최소 10억원)')
                        .setMinValue(1000000000)
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
            subCommand.setName('매수')
                .setDescription('펀드를 매수합니다.')
                .addStringOption((option) =>
                    option.setName('이름')
                        .setDescription('매수할 펀드의 이름')
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
            subCommand.setName('매도')
                .setDescription('보유 중인 펀드를 매도합니다.')
                .addStringOption((option) =>
                    option.setName('이름')
                        .setDescription('매도할 펀드의 이름')
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option.setName('좌수')
                        .setDescription('매도할 좌수')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommandGroup((subCommandGroup) =>
            subCommandGroup.setName('관리자')
                .setDescription('펀드의 관리자 페이지')
                .addSubcommand((subCommand) =>
                    subCommand.setName('추가')
                        .setDescription('펀드의 관리자를 추가합니다.')
                        .addUserOption((option) =>
                            option.setName('유저')
                                .setDescription('펀드의 관리자로 등록할 유저')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('삭제')
                        .setDescription('펀드의 관리자를 삭제합니다.')
                        .addIntegerOption((option) =>
                            option.setName('관리자번호')
                                .setDescription('펀드의 관리자에서 제거할 관리자의 번호. (관리자 번호는 **/펀드 관리자목록**을 통해 확인할 수 있습니다)')
                                .setRequired(true)
                        )
                )
                .addSubcommand((subCommand) =>
                    subCommand.setName('목록')
                        .setDescription('펀드의 관리자 목록을 가져옵니다.')
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
                .addSubcommand((subCommand) =>
                    subCommand.setName('소유권이전')
                        .setDescription('펀드의 소유권을 다른 관리자에게 이전합니다. (현재 로그인된 펀드 기준, 소유자만 가능)')
                        .addUserOption((option) =>
                            option.setName('유저')
                                .setDescription('소유권을 이전할 관리자 유저')
                                .setRequired(true)
                        )
                )
        ),
    
    async execute(interaction) {
        const subCommandGroup = interaction.options.getSubcommandGroup(false);
        const subCommand = interaction.options.getSubcommand();

        if (subCommandGroup === '관리자') {
            // Helper: get currently logged-in fund name from state
            const getFundNameFromState = async () => {
                const userState = await getUserState(interaction.user.id);
                if (userState.state === 'error') return { error: true };
                const currentAccount = userState.data.state.currentAccount;
                if (currentAccount === '@self') return { notLoggedIn: true };
                return { fundName: currentAccount.replace('@fund_', '') };
            };

            if (subCommand === '추가') {
                const administrator = interaction.options.getUser('유저');

                const stateResult = await getFundNameFromState();
                if (stateResult.error) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                }
                if (stateResult.notLoggedIn) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  펀드 로그인 필요').setDescription(`펀드 관리자로 로그인된 상태에서만 사용할 수 있습니다.\n**/펀드 관리자 로그인** 명령어를 통해 로그인해주세요.`).setTimestamp()],
                    });
                    return;
                }
                const fundName = stateResult.fundName;

                const result = await fundAddAdministrator(interaction.user.id, fundName, administrator.id);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(':white_check_mark:  펀드 관리자 추가 완료').setDescription(`**${fundName}** 펀드에 ${userMention(administrator.id)}를 관리자로 추가했습니다.`).setTimestamp()],
                    });
                }
            } else if (subCommand === '삭제') {
                const administratorNum = interaction.options.getInteger('관리자번호');

                const stateResult = await getFundNameFromState();
                if (stateResult.error) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                }
                if (stateResult.notLoggedIn) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  펀드 로그인 필요').setDescription(`펀드 관리자로 로그인된 상태에서만 사용할 수 있습니다.\n**/펀드 관리자 로그인** 명령어를 통해 로그인해주세요.`).setTimestamp()],
                    });
                    return;
                }
                const fundName = stateResult.fundName;

                const result = await fundRemoveAdministrator(interaction.user.id, fundName, administratorNum);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                } else if (result.state === 'invalid_admin_num') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  올바르지 않은 관리자 번호').setDescription(`올바른 관리자 번호가 아닙니다.`).setTimestamp()],
                    });
                } else if (result.state === 'cannot_remove_owner') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  소유자 삭제 불가').setDescription(`펀드 소유자는 관리자에서 삭제할 수 없습니다.\n소유권을 먼저 이전한 후 삭제해주세요.`).setTimestamp()],
                    });
                } else {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(':white_check_mark:  펀드 관리자 삭제 완료').setDescription(`**${fundName}** 펀드에서 ${userMention(result.data)}를 관리자에서 삭제했습니다.`).setTimestamp()],
                    });
                }
            } else if (subCommand === '목록') {
                const stateResult = await getFundNameFromState();
                if (stateResult.error) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                }
                if (stateResult.notLoggedIn) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  펀드 로그인 필요').setDescription(`펀드 관리자로 로그인된 상태에서만 사용할 수 있습니다.\n**/펀드 관리자 로그인** 명령어를 통해 로그인해주세요.`).setTimestamp()],
                    });
                    return;
                }
                const fundName = stateResult.fundName;

                const adminResult = await fundGetAdministrators(fundName);

                if (adminResult.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                } else if (adminResult.state === 'no_fund') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  존재하지 않는 펀드').setDescription(`**${fundName}** 펀드는 존재하지 않는 펀드입니다.`).setTimestamp()],
                    });
                    return;
                }

                const contents = adminResult.data.map((administrator, index) =>
                    `**${index + 1}.** ${userMention(administrator.userID)}${administrator.isTopAdmin ? ' 👑' : ''}`
                );

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
            } else if (subCommand === '소유권이전') {
                const newOwner = interaction.options.getUser('유저');

                const stateResult = await getFundNameFromState();
                if (stateResult.error) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                    return;
                }
                if (stateResult.notLoggedIn) {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  펀드 로그인 필요').setDescription(`펀드 관리자로 로그인된 상태에서만 사용할 수 있습니다.\n**/펀드 관리자 로그인** 명령어를 통해 로그인해주세요.`).setTimestamp()],
                    });
                    return;
                }
                const fundName = stateResult.fundName;

                const result = await fundTransferOwnership(interaction.user.id, fundName, newOwner.id);

                if (result.state === 'error') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                    });
                } else if (result.state === 'not_owner') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':no_entry:  권한 없음').setDescription(`펀드 소유자만 소유권을 이전할 수 있습니다.`).setTimestamp()],
                    });
                } else if (result.state === 'not_admin') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  관리자 아님').setDescription(`${userMention(newOwner.id)}은(는) **${fundName}** 펀드의 관리자가 아닙니다.\n먼저 관리자로 추가한 후 소유권을 이전해주세요.`).setTimestamp()],
                    });
                } else if (result.state === 'success') {
                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(':white_check_mark:  소유권 이전 완료').setDescription(`**${fundName}** 펀드의 소유권을 ${userMention(newOwner.id)}에게 이전했습니다.`).setTimestamp()],
                    });
                }
            }
            return;
        }

        if (subCommand === '목록') {
            const sortingOption = interaction.options.getString('정렬기준');

            const result = await getFundList();

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
                            .setColor(0xF1C40F)
                            .setTitle(':bar_chart:  펀드 목록')
                            .setDescription('등록된 펀드가 없습니다.')
                            .setTimestamp()
                    ],
                });
                return;
            }

            const fundData = result.data.map(fund => {
                const totalAssetValue = calculateAssetValue(fund.asset);
                const unitPrice = fund.total_units > 0 ? totalAssetValue / fund.total_units : 1000;
                const returnRate = (unitPrice - 1000) / 1000 * 100;
                return { fund, totalAssetValue, unitPrice, returnRate };
            });

            if (sortingOption === '수익률(높은순)') {
                fundData.sort((a, b) => b.returnRate - a.returnRate);
            } else if (sortingOption === '수익률(낮은순)') {
                fundData.sort((a, b) => a.returnRate - b.returnRate);
            } else if (sortingOption === '등록일(최신순)') {
                fundData.sort((a, b) => b.fund._id.getTimestamp() - a.fund._id.getTimestamp());
            } else if (sortingOption === '등록일(오래된순)') {
                fundData.sort((a, b) => a.fund._id.getTimestamp() - b.fund._id.getTimestamp());
            }

            const items = fundData.map(({ fund, unitPrice, returnRate }, index) => {
                const returnRateStr = returnRate >= 0 ? `+${returnRate.toFixed(2)}%` : `${returnRate.toFixed(2)}%`;
                const unitPriceStr = Math.round(unitPrice).toLocaleString();
                return `**${index + 1}. ${fund.name}** | ${unitPriceStr}원/유닛 (${returnRateStr})\n-# ${fund.description}`;
            });

            const ITEMS_PER_PAGE = 5;
            const pages = [];
            for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
                pages.push(items.slice(i, i + ITEMS_PER_PAGE));
            }

            const uid = uuidv4().replace(/-/g, '');
            createCache(uid, 15);
            saveCache(uid, { pages, currentPage: 0 });

            const previousPage = new ButtonBuilder()
                .setCustomId(`fund_previous_page-${interaction.user.id}-${uid}`)
                .setLabel('이전')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);

            const nextPage = new ButtonBuilder()
                .setCustomId(`fund_next_page-${interaction.user.id}-${uid}`)
                .setLabel('다음')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pages.length <= 1);

            const row = new ActionRowBuilder().addComponents(previousPage, nextPage);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle(':bar_chart:  펀드 목록')
                        .setDescription(pages[0].join('\n\n'))
                        .setTimestamp()
                ],
                components: [row],
            });
        } else if (subCommand === '등록') {
            const fundName = interaction.options.getString('이름');
            const description = interaction.options.getString('설명');
            const fee = interaction.options.getInteger('수수료');
            const initialAmount = interaction.options.getInteger('초기투자금');

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
            } else if (result.state === 'duplicate_name') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  이미 존재하는 펀드 이름')
                            .setDescription(`**${fundName}** 이름의 펀드가 이미 존재합니다.`)
                            .setTimestamp()
                    ],
                });
            } else if (result.state === 'insufficient_balance') {
                const balanceStr = result.data?.balance?.toLocaleString() ?? '알 수 없음';
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':x:  잔고 부족')
                            .setDescription(`초기 투자금 **${initialAmount.toLocaleString()}원**이 부족합니다.\n현재 잔고: **${balanceStr}원**`)
                            .setTimestamp()
                    ],
                });
            } else if (result.state === 'success') {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle(':white_check_mark:  펀드 등록 완료')
                            .addFields(
                                { name: '이름', value: fundName },
                                { name: '설명', value: description },
                                { name: '초기 투자금', value: `${initialAmount.toLocaleString()}원` },
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
            } else if (result.state === 'success') {
                const fund = result.data;
                const totalAssetValue = calculateAssetValue(fund.asset);
                const unitPrice = fund.total_units > 0 ? totalAssetValue / fund.total_units : 1000;
                const returnRate = (unitPrice - 1000) / 1000 * 100;
                const returnRateStr = returnRate >= 0 ? `+${returnRate.toFixed(2)}%` : `${returnRate.toFixed(2)}%`;

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle(`:bar_chart:  펀드 정보 [${fund.name}]`)
                            .addFields(
                                { name: '설명', value: fund.description },
                                { name: '수수료', value: `${fund.fee}%` },
                                { name: '유닛 가격', value: `${Math.round(unitPrice).toLocaleString()}원` },
                                { name: '수익률', value: returnRateStr },
                                { name: '총 유닛', value: fund.total_units.toLocaleString() },
                                { name: '운용자산', value: `${Math.round(totalAssetValue).toLocaleString()}원` },
                            )
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '매수') {
            const fundName = interaction.options.getString('이름');
            const amount = interaction.options.getInteger('금액');

            const result = await investFund(interaction.user.id, fundName, amount);

            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
            } else if (result.state === 'no_fund') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  존재하지 않는 펀드').setDescription(`**${fundName}** 펀드는 존재하지 않는 펀드입니다.`).setTimestamp()],
                });
            } else if (result.state === 'insufficient_balance') {
                const balanceStr = result.data.balance.toLocaleString();
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  잔고 부족').setDescription(`잔고가 부족합니다.\n현재 잔고: **${balanceStr}원**`).setTimestamp()],
                });
            } else if (result.state === 'insufficient_amount') {
                const unitPriceStr = Math.round(result.data.unitPrice).toLocaleString();
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  금액 부족').setDescription(`현재 유닛 가격은 **${unitPriceStr}원**입니다.\n최소 **${unitPriceStr}원** 이상 투자해야 합니다.`).setTimestamp()],
                });
            } else if (result.state === 'success') {
                const { units, unitPrice, actualCost } = result.data;
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  펀드 매수 완료')
                            .addFields(
                                { name: '펀드', value: fundName },
                                { name: '매수 좌수', value: `${units.toLocaleString()}좌` },
                                { name: '매수 단가', value: `${Math.round(unitPrice).toLocaleString()}원/좌` },
                                { name: '총 투자금액', value: `${Math.round(actualCost).toLocaleString()}원` },
                            )
                            .setTimestamp()
                    ],
                });
            }
        } else if (subCommand === '매도') {
            const fundName = interaction.options.getString('이름');
            const units = interaction.options.getInteger('좌수');

            const result = await sellFundInvestment(interaction.user.id, fundName, units);

            if (result.state === 'error') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle('서버 오류').setDescription(`오류가 발생하였습니다.\n공식 디스코드 서버 **디모랜드**에서 *서버 오류* 태그를 통해 문의해주세요.`).setTimestamp()],
                });
            } else if (result.state === 'no_fund') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  존재하지 않는 펀드').setDescription(`**${fundName}** 펀드는 존재하지 않는 펀드입니다.`).setTimestamp()],
                });
            } else if (result.state === 'no_investment') {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  보유 내역 없음').setDescription(`**${fundName}** 펀드에 투자한 내역이 없습니다.`).setTimestamp()],
                });
            } else if (result.state === 'insufficient_units') {
                const ownedStr = result.data.ownedUnits.toLocaleString();
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xEA4144).setTitle(':x:  좌수 부족').setDescription(`보유 좌수가 부족합니다.\n현재 보유 좌수: **${ownedStr}좌**`).setTimestamp()],
                });
            } else if (result.state === 'success') {
                const { units: soldUnits, unitPrice, currentValue, weightedPurchaseCost, profit, feeAmount, investorProceeds } = result.data;

                const avgPurchasePrice = weightedPurchaseCost / soldUnits;
                const profitSign = profit >= 0 ? '+' : '';

                const fields = [
                    { name: '펀드', value: fundName, inline: false },
                    { name: '매도 좌수', value: `${soldUnits.toLocaleString()}좌`, inline: true },
                    { name: '매수 평균단가', value: `${Math.round(avgPurchasePrice).toLocaleString()}원/좌`, inline: true },
                    { name: '매도 단가', value: `${Math.round(unitPrice).toLocaleString()}원/좌`, inline: true },
                    { name: '매수 금액', value: `${Math.round(weightedPurchaseCost).toLocaleString()}원`, inline: true },
                    { name: '평가금액', value: `${Math.round(currentValue).toLocaleString()}원`, inline: true },
                    { name: '평가손익', value: `${profitSign}${Math.round(profit).toLocaleString()}원`, inline: true },
                    { name: '수수료', value: feeAmount > 0 ? `${Math.round(feeAmount).toLocaleString()}원` : '없음 (수익 없음)', inline: true },
                    { name: '최종 수령금액', value: `**${Math.round(investorProceeds).toLocaleString()}원**`, inline: false },
                ];

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x448FE6)
                            .setTitle(':white_check_mark:  펀드 매도 완료')
                            .addFields(fields)
                            .setTimestamp()
                    ],
                });
            }
        }
    }
}