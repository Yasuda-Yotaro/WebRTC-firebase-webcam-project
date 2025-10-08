// src/evaluation.js

// グローバルな評価データを、評価タイプをキーとするオブジェクトで管理するように変更
const evaluationStates = {};

const FLUSH_INTERVAL = 1000;
const FINALIZATION_WAIT_TIME = 2000;

/**
 * 指定されたタイプの評価状態を取得または初期化する
 * @param {string} type - 評価のタイプ ('aruco', 'mouse'など)
 * @returns {object} 評価状態オブジェクト
 */
function getState(type) {
    if (!evaluationStates[type]) {
        evaluationStates[type] = {
            data: [],
            buffer: [],
            isEvaluating: false,
            startTime: 0,
            flushIntervalId: null,
            stopTimeoutId: null
        };
    }
    return evaluationStates[type];
}

/**
 * バッファに溜まったデータをメインの配列に移動する
 */
function flushBuffer(type) {
    const state = getState(type);
    if (state.buffer.length > 0) {
        state.data.push(...state.buffer);
        state.buffer = [];
    }
}

/**
 * 評価を開始する
 * @param {string} type - 評価のタイプ
 */
export function startEvaluation(type) {
    const state = getState(type);
    if (state.isEvaluating) return;

    if (state.stopTimeoutId) {
        clearTimeout(state.stopTimeoutId);
        state.stopTimeoutId = null;
    }

    state.isEvaluating = true;
    state.data = [];
    state.buffer = [];
    state.startTime = performance.now();
    state.flushIntervalId = setInterval(() => flushBuffer(type), FLUSH_INTERVAL);

    console.log(`Evaluation for '${type}' started.`);
    // UIの更新 (IDを動的に指定)
    document.getElementById(`${type}EvaluationStatus`).textContent = '評価中...';
    document.getElementById(`start${capitalize(type)}EvaluationBtn`).disabled = true;
    document.getElementById(`stop${capitalize(type)}EvaluationBtn`).disabled = false;
    document.getElementById(`download${capitalize(type)}CsvBtn`).disabled = true;
}

/**
 * 評価を停止する
 * @param {string} type - 評価のタイプ
 */
export function stopEvaluation(type) {
    const state = getState(type);
    if (!state.isEvaluating && !state.stopTimeoutId) return;

    const statusEl = document.getElementById(`${type}EvaluationStatus`);
    const stopBtn = document.getElementById(`stop${capitalize(type)}EvaluationBtn`);
    const startBtn = document.getElementById(`start${capitalize(type)}EvaluationBtn`);
    const downloadBtn = document.getElementById(`download${capitalize(type)}CsvBtn`);

    statusEl.textContent = '最終処理中...';
    stopBtn.disabled = true;

    state.stopTimeoutId = setTimeout(() => {
        state.isEvaluating = false;
        if (state.flushIntervalId) {
            clearInterval(state.flushIntervalId);
            state.flushIntervalId = null;
        }
        flushBuffer(type);

        const hasData = state.data.length > 0;
        console.log(`Evaluation for '${type}' stopped. Total records: ${state.data.length}. Download enabled: ${hasData}`);

        statusEl.textContent = '評価停止中';
        startBtn.disabled = false;
        downloadBtn.disabled = !hasData;
        state.stopTimeoutId = null;
    }, FINALIZATION_WAIT_TIME);
}

/**
 * 追跡データをバッファに記録する
 * @param {string} type - 評価のタイプ
 * @param {object} data - 記録するデータ
 */
export function logData(type, data) {
    const state = getState(type);
    if (!state.isEvaluating) return;
    const timestamp = (performance.now() - state.startTime) / 1000.0;
    state.buffer.push({ timestamp, ...data });
}

/**
 * 記録したデータをCSV形式でダウンロードする
 * @param {string} type - 評価のタイプ
 */
export function downloadCSV(type) {
    const state = getState(type);
    flushBuffer(type);

    if (state.data.length === 0) {
        alert("データが記録されていません。");
        return;
    }

    const header = Object.keys(state.data[0]).join(',');
    const rows = state.data.map(row => Object.values(row).join(',')).join('\n');
    const csvContent = `${header}\n${rows}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `evaluation_${type}_${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 文字列の最初の文字を大文字に変換するヘルパー関数
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}