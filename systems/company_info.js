const fs = require('fs');

function loadCompanyInfoData(filePath) {
    const map = new Map();

    const data = fs.readFileSync(filePath, 'utf-8').split('\n');

    data.forEach(line => {
        if (line.trim() !== '') {
            const [ticker, companyName, companyDescription] = line.split('|').map(str => str.trim());
            if (ticker && companyName && companyDescription) {
                map.set(ticker, {
                    companyName: companyName,
                    companyDescription: companyDescription,
                });
            }
        }
    });

    return map;
}

const companyInfoMap = loadCompanyInfoData('./data/company_info.txt');

function getCompanyInfo(ticker) {
    if (companyInfoMap.has(ticker)) {
        return companyInfoMap.get(ticker);
    } else {
        return null;
    }
}

exports.getCompanyInfo = getCompanyInfo;