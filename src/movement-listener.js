// src/movement-listener.js

const POLLING_INTERVAL = 50;
const LISTENER_TIMEOUT = 3000;

// 観測された最大の誤差（1440）を確実にカバーする値に設定
const TARGET_TOLERANCE = 1500.0;

// 過去5回分のデータを元に安定を判定する設定
const MOVEMENT_BUFFER_SIZE = 5;
const STABILITY_THRESHOLD = 0.1; // 位置の標準偏差がこの値以下なら「安定」とみなす

const activeListeners = {
    pan: null, tilt: null, zoom: null
};

export function listenForMovementEnd(track, commandType, targetValue, mouseTimestamp, channel) {
    if (activeListeners[commandType]) {
        clearInterval(activeListeners[commandType].intervalId);
        clearTimeout(activeListeners[commandType].timeoutId);
    }

    const timeoutId = setTimeout(() => {
        console.warn(`[計測タイムアウト] ${commandType} の動作完了を検出できませんでした。`);
        clearInterval(intervalId);
        activeListeners[commandType] = null;
    }, LISTENER_TIMEOUT);

    const movementBuffer = [];

    const intervalId = setInterval(() => {
        const settings = track.getSettings();
        const currentValue = settings[commandType];

        if (currentValue === undefined) {
            clearInterval(intervalId); clearTimeout(timeoutId);
            activeListeners[commandType] = null; return;
        }

        // 過去の位置データをバッファに保存
        movementBuffer.push(currentValue);
        if (movementBuffer.length > MOVEMENT_BUFFER_SIZE) {
            movementBuffer.shift(); // 古いデータを削除
        }

        const isAtTarget = Math.abs(currentValue - targetValue) < TARGET_TOLERANCE;
        let isStable = false;

        // バッファが溜まったら、データのばらつき（標準偏差）で「安定」を判定
        if (movementBuffer.length === MOVEMENT_BUFFER_SIZE) {
            const mean = movementBuffer.reduce((a, b) => a + b, 0) / MOVEMENT_BUFFER_SIZE;
            const variance = movementBuffer.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / MOVEMENT_BUFFER_SIZE;
            const stdDev = Math.sqrt(variance);

            if (stdDev < STABILITY_THRESHOLD) {
                isStable = true;
            }
        }

        // 目標範囲内におり、かつ動きが安定していれば計測完了
        if (isAtTarget && isStable) {
            const movementEndTime = performance.now();
            channel.send(JSON.stringify({
                type: 'movement_finished',
                command: commandType,
                targetValue: targetValue,
                mouseTimestamp: mouseTimestamp,
                movementEndTime: movementEndTime
            }));

            // 監視を終了
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            activeListeners[commandType] = null;
        }
    }, POLLING_INTERVAL);

    activeListeners[commandType] = { intervalId, timeoutId };
}