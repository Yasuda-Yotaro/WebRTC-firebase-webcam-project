// src/evaluation.js

let evaluationData = [];
let evaluationBuffer = []; 
let isEvaluating = false;
let startTime = 0;
let flushIntervalId = null;  

const FLUSH_INTERVAL = 1000; // データを書き込む間隔 (ミリ秒)

/**
 * バッファに溜まったデータをメインの配列に移動する
 */
function flushBuffer() {
    if (evaluationBuffer.length > 0) {
        evaluationData.push(...evaluationBuffer);
        evaluationBuffer = []; // バッファを空にする
    }
}

/**
 * 評価を開始する
 */
export function startEvaluation() {
    if (isEvaluating) return;
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
    if (!isEvaluating) return;
    isEvaluating = false;

    if (flushIntervalId) {
        clearInterval(flushIntervalId);
        flushIntervalId = null;
    }
    // 停止時に残っているバッファをすべて書き出す
    flushBuffer();

    console.log("Evaluation stopped.");
    // UIの更新
    document.getElementById('evaluationStatus').textContent = '評価停止中';
    document.getElementById('startEvaluationBtn').disabled = false;
    document.getElementById('stopEvaluationBtn').disabled = true;
    document.getElementById('downloadCsvBtn').disabled = evaluationData.length === 0;
}

/**
 * 追跡データをバッファに記録する
 * @param {object} data - 記録するデータオブジェクト
 */
export function logData(data) {
    if (!isEvaluating) return;
    const timestamp = (performance.now() - startTime) / 1000.0; // 秒単位
    // メイン配列ではなくバッファに追加
    evaluationBuffer.push({ timestamp, ...data });
}

/**
 * 記録したデータをCSV形式でダウンロードする
 */
export function downloadCSV() {
    // ダウンロード前にバッファをフラッシュ
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