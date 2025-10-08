// src/clock-sync.js

const SYNC_SAMPLES = 10; // ズレ計測のために送受信する回数
const SYNC_TIMEOUT = 1000; // 各やりとりのタイムアウト時間(ミリ秒)

/**
 * 2台のPC間の時計のズレ（オフセット）を計測する
 * @param {RTCDataChannel} channel - ptz用のデータチャネル
 * @returns {Promise<number>} 計算された平均オフセット値
 */
export function measureClockOffset(channel) {
    return new Promise(async (resolve) => {
        const offsets = [];
        let completed = 0;

        const handlePong = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type !== 'pong') return;

            const t3 = performance.now();
            const rtt = t3 - msg.t1;
            // オフセットを計算: (サーバー時刻) - (クライアント時刻 + 一方向遅延)
            const offset = msg.t2 - (msg.t1 + rtt / 2);
            offsets.push(offset);
            completed++;
        };

        channel.addEventListener('message', handlePong);

        for (let i = 0; i < SYNC_SAMPLES; i++) {
            const t1 = performance.now();
            channel.send(JSON.stringify({ type: 'ping', t1 }));
            // 少し待ってから次のpingを送信
            await new Promise(res => setTimeout(res, 50));
        }

        // 全てのpongが返ってくるか、タイムアウトするまで待つ
        setTimeout(() => {
            channel.removeEventListener('message', handlePong);
            if (offsets.length === 0) {
                console.warn("時計のズレを計測できませんでした。オフセットは0として扱います。");
                resolve(0);
                return;
            }
            // 平均値を計算して返す
            const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
            console.log(`[時計同期完了] PC間の平均ズレ: ${avgOffset.toFixed(2)} ms`);
            resolve(avgOffset);
        }, SYNC_TIMEOUT);
    });
}