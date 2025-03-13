const { SlashCommandBuilder, userMention } = require('discord.js');
const { fundAddAdministrator, fundRemoveAdministrator, fundGetAdministrators, fundLogin, fundLogout, fundCreate, getFundInfo, getFundList } = require('../database');
const { calculateAssetValue } = require('../stock_system/credit_system');

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
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === '목록') {
            const sortingOption = interaction.options.getString('정렬기준');

            const fund_list = await getFundList();
            
            let sorted_fund_list;
            if (sortingOption === '수익률(높은순)') {
                
            } else if (sortingOption === '수익률(낮은순)') {

            } else if (sortingOption === '등록일(최신순)') {

            } else if (sortingOption === '등록일(오래된순)') {

            }
        } else if (subCommand === '등록') {
            const fundName = interaction.options.getString('이름');
            const description = interaction.options.getString('설명');
            const fee = interaction.options.getInteger('수수료');

            const result = await fundCreate(interaction.user.id, fundName, description, fee);

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
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEA4144)
                            .setTitle(':white_check_mark:  펀드 등록 완료')
                            .addFields(
                                { name: '이름', value: fundName },
                                { name: '설명', value: description },
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
                const investment_asset = calculateAssetValue(result.data.asset);
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xF1C40F)
                            .setTitle('펀드 정보')
                            .setDescription(`**펀드명:** ${result.data.name}
                                **설명:** ${result.data.description}
                                **수수료:** ${result.data.fee}%
                                **운용자산:** ${stockInfo.totalQuantity.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")}주`)
                            .addFields(
                                { name: '이름', value: result.data.name },
                                { name: '설명', value: result.data.description },
                                { name: '수수료', value: result.data.fee },
                                { name: '운용자산', value: investment_asset },
                            )
                    ],
                });
            }
        } else {
            const subCommandGroup = interaction.options.getSubcommandGroup();

            if (subCommandGroup === '관리자') {
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
                    } else if (result.state === 'success') {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle(':white_check_mark:  펀드 관리자 추가 완료')
                                    .setDescription(`**${fundName}** 펀드에 ${userMention(administrator.id)}를 관리자로 추가했습니다.`)
                                    .setTimestamp()
                            ],
                        });
                    }
                } else if (subCommand === '삭제') {
                    const fundName = interaction.options.getString('이름');
                    const administratorNum = interaction.options.getInteger('관리자번호');

                    const result = await fundRemoveAdministrator(interaction.id, fundName, administratorNum);

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
                                    .setDescription(`**fundName** 펀드는 존재하지 않는 펀드입니다.`)
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
                    } else {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle(':white_check_mark:  펀드 관리자 삭제 완료')
                                    .setDescription(`**${fundName}** 펀드에서 ${userMention(result.data)}를 관리자에서 삭제했습니다.`)
                                    .setTimestamp()
                            ],
                        });
                    }
                } else if (subCommand === '목록') {
                    const fundName = interaction.options.getString('이름');

                    const administratorList = await fundGetAdministrators(fundName);

                    const contents = [];
                    administratorList.forEach((administrator) => {
                        contents.push(`${userMention(administrator.userID)}`)
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
                                    .setDescription(`**fundName** 펀드는 존재하지 않는 펀드입니다.`)
                                    .setTimestamp()
                            ],
                        });
                    } else if (result.state === 'not_admin') {
                        await interaction.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xEA4144)
                                    .setTitle(':no_entry:  권한 없음')
                                    .setDescription(`**fundName** 펀드의 관리자가 아닙니다.`)
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
                                    .setTitle(`:white_check_mark:  로그인 성공`)
                                    .setDescription(`펀드에 관리자에서 로그아웃을 성공했습니다.`)
                                    .setTimestamp()
                            ],
                        });
                    }
                }
            }
        }
    }
}