// src/evaluation.js

let evaluationData = [];
let evaluationBuffer = [];
let isEvaluating = false;
let startTime = 0;
let flushIntervalId = null;
let stopTimeoutId = null; // ★ 停止処理用のタイムアウトID

const FLUSH_INTERVAL = 1000;
const FINALIZATION_WAIT_TIME = 2000; // ★ 停止後、最後のデータを待つ時間 (2秒)

/**
 * バッファに溜まったデータをメインの配列に移動する
 */
function flushBuffer() {
    if (evaluationBuffer.length > 0) {
        evaluationData.push(...evaluationBuffer);
        evaluationBuffer = [];
    }
}

/**
 * 評価を開始する
 */
export function startEvaluation() {
    if (isEvaluating) return;
    // 以前の停止処理が残っていたらクリア
    if (stopTimeoutId) {
        clearTimeout(stopTimeoutId);
        stopTimeoutId = null;
    }

    isEvaluating = true;
    evaluationData = [];
    evaluationBuffer = [];
    startTime = performance.now();

    flushIntervalId = setInterval(flushBuffer, FLUSH_INTERVAL);

    console.log("Evaluation started.");
    // UIの更新
    document.getElementById('evaluationStatus').textContent = '評価中...';
    document.getElementById('startEvaluationBtn').disabled = true;
    document.getElementById('stopEvaluationBtn').disabled = false;
    document.getElementById('downloadCsvBtn').disabled = true;
}

/**
 * 評価を停止する
 */
export function stopEvaluation() {
    if (!isEvaluating && !stopTimeoutId) return;

    // ★★★ 最終解決ロジック ★★★
    // 1. UIを「最終処理中...」の状態にし、ユーザーが連続でボタンを押せないようにする
    document.getElementById('evaluationStatus').textContent = '最終処理中...';
    document.getElementById('stopEvaluationBtn').disabled = true;

    // 2. 最後のデータがネットワーク経由で到着するのを待つための待機時間を設ける
    stopTimeoutId = setTimeout(() => {
        // 3. 待機時間が経過した後、記録を完全に停止する
        isEvaluating = false;
        if (flushIntervalId) {
            clearInterval(flushIntervalId);
            flushIntervalId = null;
        }

        // 4. バッファに残っている最後のデータを完全に整理する
        flushBuffer();

        // 5. すべてのデータが確定した状態で、記録が1件以上あるかを確認
        const hasData = evaluationData.length > 0;

        console.log(`Evaluation stopped. Total records: ${evaluationData.length}. Download enabled: ${hasData}`);

        // 6. 最終的なUI状態を確定させる
        document.getElementById('evaluationStatus').textContent = '評価停止中';
        document.getElementById('startEvaluationBtn').disabled = false;
        document.getElementById('downloadCsvBtn').disabled = !hasData;
        stopTimeoutId = null;

    }, FINALIZATION_WAIT_TIME);
}

/**
 * 追跡データをバッファに記録する
 */
export function logData(data) {
    if (!isEvaluating) return;
    const timestamp = (performance.now() - startTime) / 1000.0;
    evaluationBuffer.push({ timestamp, ...data });
}

/**
 * 記録したデータをCSV形式でダウンロードする
 */
export function downloadCSV() {
    flushBuffer();

    if (evaluationData.length === 0) {
        alert("データが記録されていません。");
        return;
    }

    const header = Object.keys(evaluationData[0]).join(',');
    const rows = evaluationData.map(row => Object.values(row).join(',')).join('\n');
    const csvContent = `${header}\n${rows}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `tracking_evaluation_${new Date().toISOString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}