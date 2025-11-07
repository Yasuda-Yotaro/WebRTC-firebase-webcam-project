// src/ptz-evaluation.js

let evaluationData = [];
let evaluationBuffer = [];
let isEvaluating = false;
let flushIntervalId = null;

const FLUSH_INTERVAL = 1000;

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
    flushIntervalId = setInterval(flushBuffer, FLUSH_INTERVAL);

    console.log("PTZ Latency evaluation started.");
    document.getElementById('ptzEvaluationStatus').textContent = '評価中...';
    document.getElementById('startPtzEvaluationBtn').disabled = true;
    document.getElementById('stopPtzEvaluationBtn').disabled = false;
    document.getElementById('downloadPtzCsvBtn').disabled = true;
}

export function stopEvaluation() {
    if (!isEvaluating) return;
    isEvaluating = false;
    if (flushIntervalId) {
        clearInterval(flushIntervalId);
        flushIntervalId = null;
    }
    flushBuffer();

    console.log("PTZ Latency evaluation stopped.");
    document.getElementById('ptzEvaluationStatus').textContent = '評価停止中';
    document.getElementById('startPtzEvaluationBtn').disabled = false;
    document.getElementById('stopPtzEvaluationBtn').disabled = true;
    document.getElementById('downloadPtzCsvBtn').disabled = evaluationData.length === 0;
}

/**
 * 追跡データをバッファに記録する
 * @param {object} data - 記録するデータオブジェクト
 */
export function logData(data) {
    if (!isEvaluating) return;
    const timestamp = new Date().toISOString();
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
        link.setAttribute("download", `ptz_latency_evaluation_${new Date().toISOString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        evaluationData = [];
        evaluationBuffer = [];
        document.getElementById('downloadPtzCsvBtn').disabled = true;
    }   
}