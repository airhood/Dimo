const { Koreanbots } = require("koreanbots");
const { koreanbots_token, clientId } = require('./config.json');

const koreanbots = new Koreanbots({
    api: {
        token: koreanbots_token,
    },
    clientID: clientId,
});

let client;

const update = servers => koreanbots.mybot.update({ servers, shards: client.shard?.count }) 
    .then(res => console.log("서버 수를 정상적으로 업데이트하였습니다!\n반환된 정보:" + JSON.stringify(res)))
    .catch(console.error)
    
module.exports = {
    setClient_koreanbots_update: (_client) => {
        client = _client;
    },

    setUpdateInterval: () => {
        update(client.guilds.cache.size) // 준비 상태를 시작할 때, 최초로 업데이트합니다.
        setInterval(() => update(client.guilds.cache.size), 600000) // 10분마다 서버 수를 업데이트합니다.
    }
}