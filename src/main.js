// main.js (ドラッグ状態管理を修正した最終版)

import { updateRoleUI, populateCameraList, updateCameraCountUI } from './ui.js';
import * as uiElements from './ui-elements.js';
import * as state from './state.js';
import { startCall, joinCall, hangUp } from './webrtc.js';
import { sendPtzCommand, updateReceiverPtzControls } from './ptz.js';
import { startStatsRecording, stopStatsRecording, downloadStatsAsCsv } from './stats.js';
import { startRecording, stopRecording, downloadVideo } from './recording.js';
import { start as startArucoTracking, stop as stopArucoTracking } from './aruco.js';
import * as evaluation from './evaluation.js';

// ▼▼▼ 根本原因修正 ▼▼▼
// PTZ操作のためのドラッグ状態を管理する変数を、モジュールのトップレベルに移動。
// これにより、複数のビデオコンテナで状態が共有され、競合しなくなる。
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let draggedElement = null;

// ドラッグ終了処理もトップレベルに定義
const stopDrag = () => {
  if (isDragging) {
    isDragging = false;
    if (draggedElement) {
      draggedElement.classList.remove('dragging');
      draggedElement = null;
    }
  }
};
// ▲▲▲ 根本原因修正 ▲▲▲

/**
 * 指定されたビデオコンテナにPTZ操作のためのマウスイベントリスナーを設定する。
 * @param {HTMLElement} container - イベントリスナーを設定するコンテナ要素
 */
export function activatePtzControlsForVideo(container) {
  // スロットリングのための変数
  let throttleTimer = null;
  const THROTTLE_DELAY = 50; // 50msごとにコマンドを送信

  // マウス移動（ドラッグ）時の処理
  const handlePtzOnMouseMove = (event) => {
    if (!isDragging) return; // トップレベルの isDragging を参照
    if (throttleTimer) return;

    const commandTimestamp = performance.now();
    throttleTimer = setTimeout(() => {
        const PAN_SENSITIVITY_DIVISOR = 5;
        const TILT_SENSITIVITY_DIVISOR = 5;
        const deltaX = event.clientX - lastMouseX;
        const deltaY = event.clientY - lastMouseY;
        
        evaluation.logData('mouse', {
            eventType: 'drag',
            clientX: event.clientX,
            clientY: event.clientY,
            deltaX: deltaX,
            deltaY: deltaY
        });
        
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

        const caps = getActiveCaps();
        if (caps.pan) sendPtzCommand('pan', getSliderValue('pan') + deltaX * (caps.pan.step / PAN_SENSITIVITY_DIVISOR), commandTimestamp);
        if (caps.tilt) sendPtzCommand('tilt', getSliderValue('tilt') - deltaY * (caps.tilt.step / TILT_SENSITIVITY_DIVISOR), commandTimestamp);
        
        throttleTimer = null;
    }, THROTTLE_DELAY);
  };

  // マウスホイール時の処理
  const handlePtzOnWheel = (event) => {
    event.preventDefault();
    evaluation.logData('mouse', {
        eventType: 'wheel',
        deltaY: event.deltaY
    });

    const caps = getActiveCaps();
    if (caps.zoom) {
      const commandTimestamp = performance.now();
      const ZOOM_SENSITIVITY_DIVISOR = 20; 
      const newZoom = getSliderValue('zoom') - event.deltaY * (caps.zoom.step / ZOOM_SENSITIVITY_DIVISOR);
      sendPtzCommand('zoom', newZoom, commandTimestamp);
    }
  };

  // ドラッグ開始時の処理
  const startDrag = (event) => {
    if (event.button !== 0) return; // 左クリック以外は無視
    
    // トップレベルの変数を更新
    isDragging = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    draggedElement = event.currentTarget;
    draggedElement.classList.add('dragging');
  };
  
  // コンテナに各イベントリスナーを設定
  container.addEventListener('mousedown', startDrag);
  container.addEventListener('mousemove', handlePtzOnMouseMove);
  container.addEventListener('wheel', handlePtzOnWheel);
}


// =================================================================================
// --- イベントリスナーの初期化 (Initialize Event Listeners) ---
// =================================================================================
const getSliderValue = (type) => parseFloat(document.getElementById(`${type}Slider`).value);
const getActiveCaps = () => state.ptzCapabilities[state.activePtzTarget] || {};

/**
 * アプリケーションのすべてのイベントリスナーを初期化する。
 */
function initializeEventListeners() {
  uiElements.roleInputs.forEach(input => {
    input.addEventListener("change", (e) => updateRoleUI(e.target.value));
  });

  uiElements.cameraCountSelect.addEventListener("change", updateCameraCountUI);

  uiElements.copyCallIdBtn.addEventListener("click", async () => {
    const callId = uiElements.callIdDisplay.textContent.trim();
    if (!callId) return;
    try {
      await navigator.clipboard.writeText(callId);
      uiElements.copyCallIdBtn.textContent = "コピー済み";
      setTimeout(() => { uiElements.copyCallIdBtn.textContent = "コピー"; }, 1500);
    } catch (err) {
      alert("コピーに失敗しました。");
      console.error("Failed to copy Call ID: ", err);
    }
  });

  uiElements.startCameraBtn.addEventListener("click", startCall);
  uiElements.joinCallBtn.addEventListener("click", joinCall);
  uiElements.hangUpBtn.addEventListener("click", hangUp);
  
  uiElements.startStatsRecordingBtn.addEventListener("click", startStatsRecording);
  uiElements.stopStatsRecordingBtn.addEventListener("click", stopStatsRecording);
  uiElements.downloadStatsBtn.addEventListener("click", downloadStatsAsCsv);

  // Recording button event listeners
  uiElements.startRecordingBtn1.addEventListener("click", () => startRecording('camera1'));
  uiElements.stopRecordingBtn1.addEventListener("click", () => stopRecording('camera1'));
  uiElements.downloadVideoBtn1.addEventListener("click", () => downloadVideo('camera1'));

  uiElements.startRecordingBtn2.addEventListener("click", () => startRecording('camera2'));
  uiElements.stopRecordingBtn2.addEventListener("click", () => stopRecording('camera2'));
  uiElements.downloadVideoBtn2.addEventListener("click", () => downloadVideo('camera2'));

  // ArUco Tracking event listeners
  uiElements.startArucoTrackingBtn.addEventListener("click", () => {
    const target = uiElements.arucoTargetSelect.value;
    startArucoTracking(target);
    uiElements.startArucoTrackingBtn.disabled = true;
    uiElements.stopArucoTrackingBtn.disabled = false;
    uiElements.arucoTargetSelect.disabled = true;
  });

  uiElements.stopArucoTrackingBtn.addEventListener("click", () => {
    stopArucoTracking();
    uiElements.startArucoTrackingBtn.disabled = false;
    uiElements.stopArucoTrackingBtn.disabled = true;
    uiElements.arucoTargetSelect.disabled = false;
  });

  uiElements.ptzTargetInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      if (e.target.checked) {
        updateReceiverPtzControls(e.target.value);
      }
    });
  });
  
  uiElements.zoomInBtn.addEventListener("click", () => {
      const caps = getActiveCaps();
      if (caps.zoom) sendPtzCommand('zoom', getSliderValue('zoom') + caps.zoom.step);
  });
  uiElements.zoomOutBtn.addEventListener("click", () => {
      const caps = getActiveCaps();
      if (caps.zoom) sendPtzCommand('zoom', getSliderValue('zoom') - caps.zoom.step);
  });
  uiElements.zoomSlider.addEventListener("input", () => sendPtzCommand('zoom', getSliderValue('zoom')));
  
  uiElements.tiltUpBtn.addEventListener("click", () => {
      const caps = getActiveCaps();
      if (caps.tilt) sendPtzCommand('tilt', getSliderValue('tilt') + caps.tilt.step);
  });
  uiElements.tiltDownBtn.addEventListener("click", () => {
      const caps = getActiveCaps();
      if (caps.tilt) sendPtzCommand('tilt', getSliderValue('tilt') - caps.tilt.step);
  });
  uiElements.tiltSlider.addEventListener("input", () => sendPtzCommand('tilt', getSliderValue('tilt')));
  
  uiElements.panRightBtn.addEventListener("click", () => {
      const caps = getActiveCaps();
      if (caps.pan) sendPtzCommand('pan', getSliderValue('pan') + caps.pan.step);
  });
  uiElements.panLeftBtn.addEventListener("click", () => {
      const caps = getActiveCaps();
      if (caps.pan) sendPtzCommand('pan', getSliderValue('pan') - caps.pan.step);
  });
  uiElements.panSlider.addEventListener("input", () => sendPtzCommand('pan', getSliderValue('pan')));
  
  uiElements.ptzResetBtn.addEventListener("click", () => {
    const caps = getActiveCaps();
    if (caps.zoom) sendPtzCommand('zoom', caps.zoom.min);
    if (caps.tilt) sendPtzCommand('tilt', 0);
    if (caps.pan) sendPtzCommand('pan', 0);
  });

  window.addEventListener('keydown', (event) => {
    if (state.currentRole !== 'receiver' || uiElements.ptzControls.style.display === 'none' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
    }

    let commandSent = false;
    const caps = getActiveCaps();
    switch (event.key) {
        case 'ArrowUp': if (caps.tilt) { sendPtzCommand('tilt', getSliderValue('tilt') + caps.tilt.step); commandSent = true; } break;
        case 'ArrowDown': if (caps.tilt) { sendPtzCommand('tilt', getSliderValue('tilt') - caps.tilt.step); commandSent = true; } break;
        case 'ArrowLeft': if (caps.pan) { sendPtzCommand('pan', getSliderValue('pan') - caps.pan.step); commandSent = true; } break;
        case 'ArrowRight': if (caps.pan) { sendPtzCommand('pan', getSliderValue('pan') + caps.pan.step); commandSent = true; } break;
        case '+': case 'PageUp': if (caps.zoom) { sendPtzCommand('zoom', getSliderValue('zoom') + caps.zoom.step); commandSent = true; } break;
        case '-': case 'PageDown': if (caps.zoom) { sendPtzCommand('zoom', getSliderValue('zoom') - caps.zoom.step); commandSent = true; } break;
        case 'r': case 'R':
            if (caps.zoom) sendPtzCommand('zoom', caps.zoom.min);
            if (caps.tilt) sendPtzCommand('tilt', 0);
            if (caps.pan) sendPtzCommand('pan', 0);
            commandSent = true;
            break;
    }
    if (commandSent) event.preventDefault();
  });

  uiElements.fullscreenBtn1.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        uiElements.remoteVideoContainer1.requestFullscreen().catch(err => {
            alert(`フルスクリーンにできませんでした: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
  });
  uiElements.fullscreenBtn2.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        uiElements.remoteVideoContainer2.requestFullscreen().catch(err => {
            alert(`フルスクリーンにできませんでした: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = !!document.fullscreenElement;
    uiElements.fullscreenBtn1.textContent = isFullscreen && document.fullscreenElement === uiElements.remoteVideoContainer1 ? '通常表示' : 'フルスクリーン';
    uiElements.fullscreenBtn2.textContent = isFullscreen && document.fullscreenElement === uiElements.remoteVideoContainer2 ? '通常表示' : 'フルスクリーン';
  });

  // ▼▼▼ 根本原因修正 ▼▼▼
  // ページ全体で一度だけ、マウスアップ（ドラッグ終了）イベントを監視する
  window.addEventListener('mouseup', stopDrag);
  // ▲▲▲ 根本原因修正 ▲▲▲
}

// =================================================================================
// --- 初期化 (Initialization) ---
// =================================================================================

updateRoleUI(document.querySelector('input[name="role"]:checked').value);
initializeEventListeners();
populateCameraList();

// 評価コントロールのイベントリスナーを設定
document.getElementById('startArucoEvaluationBtn').addEventListener('click', () => evaluation.startEvaluation('aruco'));
document.getElementById('stopArucoEvaluationBtn').addEventListener('click', () => evaluation.stopEvaluation('aruco'));
document.getElementById('downloadArucoCsvBtn').addEventListener('click', () => evaluation.downloadCSV('aruco'));

document.getElementById('startMouseEvaluationBtn').addEventListener('click', () => evaluation.startEvaluation('mouse'));
document.getElementById('stopMouseEvaluationBtn').addEventListener('click', () => evaluation.stopEvaluation('mouse'));
document.getElementById('downloadMouseCsvBtn').addEventListener('click', () => evaluation.downloadCSV('mouse'));