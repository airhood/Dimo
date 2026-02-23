
cache = {};

const printAllCache = () => {
    const cacheContents = Object.keys(cache).map(uid => {
        return {
            uid: uid,
            data: cache[uid].data
        };
    });
    console.log(JSON.stringify(cacheContents, null, 2));
}

module.exports = {
    createCache: (uid, expireMin) => {
        if (!uid || expireMin <= 0) return;
        const timerID = setTimeout(() => {
            delete cache[uid];
        }, expireMin * 60 * 1000);
        cache[uid] = {
            data: undefined,
            timerID: timerID,
        }
    },

    saveCache: (uid, data) => {
        if (!uid || !data) return;
        cache[uid].data = data;
    },

    loadCache: (uid) => {
        if (!uid) return undefined;
        if (cache[uid]) {
            return cache[uid].data;
        }
        return undefined;
    },

    deleteCache: (uid) => {
        if (cache[uid]) {
            clearTimeout(cache[uid].timerID);
            delete cache[uid];
        }
    }
}