// src/evaluation.js

let evaluationData = [];
let evaluationBuffer = [];
let isEvaluating = false;
let startTime = 0;
let flushIntervalId = null;

const FLUSH_INTERVAL = 1000;

/**
 * 現在の日時を YYYY-MM-DD HH:mm:ss.sss 形式の文字列で取得する
 * @param {Date} date - フォーマットするDateオブジェクト
 * @returns {string} フォーマットされた日時文字列
 */
function getFormattedTimestamp(date) {
    const Y = date.getFullYear();
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const D = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
}

function flushBuffer() {
    if (evaluationBuffer.length > 0) {
        evaluationData.push(...evaluationBuffer);
        evaluationBuffer = [];
    }
}

export function startEvaluation() {
    if (isEvaluating) return;
    isEvaluating = true;
    evaluationData = [];
    evaluationBuffer = [];
    startTime = performance.now();
    flushIntervalId = setInterval(flushBuffer, FLUSH_INTERVAL);

    console.log("Evaluation started.");
    document.getElementById('evaluationStatus').textContent = '評価中...';
    document.getElementById('startEvaluationBtn').disabled = true;
    document.getElementById('stopEvaluationBtn').disabled = false;
    document.getElementById('downloadCsvBtn').disabled = true;
}

export function stopEvaluation() {
    if (!isEvaluating) return;
    isEvaluating = false;
    if (flushIntervalId) {
        clearInterval(flushIntervalId);
        flushIntervalId = null;
    }
    flushBuffer();

    console.log("Evaluation stopped.");
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
    const timestamp = getFormattedTimestamp(new Date());
    evaluationBuffer.push({ timestamp, ...data });
}

export function downloadCSV() {
    flushBuffer();
    if (evaluationData.length === 0) {
        alert("データが記録されていません。");
        return;
    }

    const header = Object.keys(evaluationData[0]).join(',');
    const rows = evaluationData.map(row => {
        return Object.values(row).map(value => {
            if (typeof value === 'number') {
                return value.toFixed(3);
            }
            return value;
        }).join(',');
    }).join('\n');
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