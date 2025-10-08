// src/recording.js

import * as state from './state.js';
import * as uiElements from './ui-elements.js';
import fixWebmDuration from 'webm-duration-fix';

/**
 * カメラの録画を開始する
 * @param {string} target - 'camera1' or 'camera2'
 */
export function startRecording(target) {
    if (state.isRecording[target] || state.currentRole !== 'receiver') return;

    const videoElement = target === 'camera1' ? uiElements.remoteVideo1 : uiElements.remoteVideo2;
    if (!videoElement || !videoElement.srcObject) {
        alert(`${target} のビデオストリームが見つかりません。`);
        return;
    }

    const stream = videoElement.srcObject;
    state.setRecordedChunks(target, []);
    state.setIsRecording(target, true);

    const ui = getUiForTarget(target);

    try {
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
        state.setMediaRecorder(target, recorder);

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.recordedChunks[target].push(event.data);
            }
        };

        recorder.onstop = () => {
            console.log(`Recording stopped for ${target}. Total chunks:`, state.recordedChunks[target].length);
            ui.startBtn.disabled = false;
            ui.stopBtn.disabled = true;
            ui.downloadBtn.disabled = state.recordedChunks[target].length === 0;
            ui.status.textContent = `録画停止。`;
        };

        recorder.start(100);
        console.log(`Recording started for ${target}.`);

        ui.startBtn.disabled = true;
        ui.stopBtn.disabled = false;
        ui.downloadBtn.disabled = true;
        ui.status.textContent = "録画中...";

    } catch (e) {
        console.error(`Error starting MediaRecorder for ${target}:`, e);
        alert(`${target} の録画開始に失敗しました。`);
        state.setIsRecording(target, false);
    }
}

/**
 * カメラの録画を停止する
 * @param {string} target - 'camera1' or 'camera2'
 */
export function stopRecording(target) {
    const recorder = state.mediaRecorders[target];
    if (!state.isRecording[target] || !recorder || recorder.state === 'inactive') return;

    recorder.stop();
    state.setIsRecording(target, false);
}

/**
 * 指定されたカメラの録画をダウンロードする
 * @param {string} target - 'camera1' or 'camera2'
 */
export async function downloadVideo(target) {
    const chunks = state.recordedChunks[target];
    if (chunks.length === 0) {
        alert("ダウンロードする録画データがありません。");
        return;
    }

    const ui = getUiForTarget(target);
    ui.status.textContent = "動画ファイルを処理中...";
    ui.downloadBtn.disabled = true;

    try {
        const rawBlob = new Blob(chunks, { type: 'video/webm' });
        const seekableBlob = await fixWebmDuration(rawBlob);

        const url = URL.createObjectURL(seekableBlob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = `recording_${target}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        ui.status.textContent = ``;

    } catch (error) {
        console.error(`Error fixing or downloading video for ${target}:`, error);
        alert("動画の処理またはダウンロード中にエラーが発生しました。");
        ui.status.textContent = "エラー";
    } finally {
        ui.downloadBtn.disabled = false;
    }
}

// ターゲットに応じたUI要素を返すヘルパー関数
function getUiForTarget(target) {
    if (target === 'camera1') {
        return {
            startBtn: uiElements.startRecordingBtn1,
            stopBtn: uiElements.stopRecordingBtn1,
            downloadBtn: uiElements.downloadVideoBtn1,
            status: uiElements.recordingStatus1
        };
    } else {
        return {
            startBtn: uiElements.startRecordingBtn2,
            stopBtn: uiElements.stopRecordingBtn2,
            downloadBtn: uiElements.downloadVideoBtn2,
            status: uiElements.recordingStatus2
        };
    }
}