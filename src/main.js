// main.js

import { updateRoleUI, populateCameraList, updateCameraCountUI } from './ui.js';
import * as uiElements from './ui-elements.js';
import * as state from './state.js';
import { startCall, joinCall, hangUp, setVideoBandwidthKbps } from './webrtc.js';
import { sendPtzCommand, updateReceiverPtzControls, sendUnmeasuredPtzCommand } from './ptz.js';
import { startStatsRecording, stopStatsRecording, downloadStatsAsCsv } from './stats.js';
import { startRecording, stopRecording, downloadVideo } from './recording.js';
import { start as startArucoTracking, stop as stopArucoTracking } from './aruco.js';
import * as evaluation from './evaluation.js';
import * as imu from './imu.js';
import * as ptzEvaluation from './ptz-evaluation.js';

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
      alert("コピーに失敗");
      console.error("Failed to copy Call ID: ", err);
    }
  });

  // 「カメラ開始 & 通話作成」ボタンのイベントリスナー
  uiElements.startCameraBtn.addEventListener("click", () => {
    const enableAruco = document.getElementById('enableArucoCheckbox').checked;
    const arucoControls = document.getElementById('arucoControls');

    // チェックボックスがチェックされている場合のみ、ArUcoコントロールを表示する
    arucoControls.style.display = enableAruco ? 'block' : 'none';
    
    startCall();
  });

  // 帯域制限のイベントリスナー
  uiElements.applyBandwidthBtn.addEventListener('click', async () => {
    const val = parseInt(uiElements.bandwidthKbpsInput.value, 10);
    if (isNaN(val) || val < 0) {
      alert('帯域（kbps）を正しく入力してください。');
      return;
    }
    try {
      await setVideoBandwidthKbps(val);
      // ユーザーにフィードバック
      uiElements.applyBandwidthBtn.textContent = '適用済み';
      setTimeout(() => { uiElements.applyBandwidthBtn.textContent = '適用'; }, 1500);
    } catch (e) {
      alert('帯域の適用に失敗しました。');
    }
  });
  

  uiElements.joinCallBtn.addEventListener("click", joinCall);
  uiElements.hangUpBtn.addEventListener("click", hangUp);

  // WebRTC統計情報のイベントリスナー
  uiElements.startStatsRecordingBtn.addEventListener("click", startStatsRecording);
  uiElements.stopStatsRecordingBtn.addEventListener("click", stopStatsRecording);
  uiElements.downloadStatsBtn.addEventListener("click", downloadStatsAsCsv);

  // 録画のイベントリスナー
  uiElements.startRecordingBtn1.addEventListener("click", () => startRecording('camera1'));
  uiElements.stopRecordingBtn1.addEventListener("click", () => stopRecording('camera1'));
  uiElements.downloadVideoBtn1.addEventListener("click", () => downloadVideo('camera1'));

  uiElements.startRecordingBtn2.addEventListener("click", () => startRecording('camera2'));
  uiElements.stopRecordingBtn2.addEventListener("click", () => stopRecording('camera2'));
  uiElements.downloadVideoBtn2.addEventListener("click", () => downloadVideo('camera2'));

  // ArUcoマーカー追跡のイベントリスナー
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

  // PTZ操作対象選択のイベントリスナー(カメラ1 or カメラ2)
  uiElements.ptzTargetInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      if (e.target.checked) {
        updateReceiverPtzControls(e.target.value);
      }
    });
  });

  const getSliderValue = (type) => parseFloat(document.getElementById(`${type}Slider`).value);
  const getActiveCaps = () => state.ptzCapabilities[state.activePtzTarget] || {}; // 現在のPTZターゲットの能力を取得

  /**
   * PTZ操作ボタン（+-）のクリックイベントを設定する関数
   * @param {'zoom' | 'pan' | 'tilt'} type - 操作の種類
   */
  const setupPtzButtonClick = (type) => {
    const increaseBtn = document.getElementById(type === 'zoom' ? 'zoomInBtn' : type === 'pan' ? 'panRightBtn' : 'tiltUpBtn');
    const decreaseBtn = document.getElementById(type === 'zoom' ? 'zoomOutBtn' : type === 'pan' ? 'panLeftBtn' : 'tiltDownBtn');
    const slider = document.getElementById(`${type}Slider`);
    const stepInput = document.getElementById(`${type}StepInput`); // HTMLで追加した操作量入力ボックス

    // 「+」や「→」ボタンの処理
    increaseBtn.addEventListener('click', () => {
      // ユーザーが入力した操作量を取得
      const step = parseFloat(stepInput.value);
      if (isNaN(step)) return; 

      // 現在のスライダーの値に操作量を加算
      const newValue = parseFloat(slider.value) + step;

      // 計測対象のコマンドを送信
      sendPtzCommand(type, newValue);
    });

    // 「-」や「←」ボタンの処理
    decreaseBtn.addEventListener('click', () => {
      // ユーザーが入力した操作量を取得
      const step = parseFloat(stepInput.value);
      if (isNaN(step)) return; 

      // 現在のスライダーの値から操作量を減算
      const newValue = parseFloat(slider.value) - step;
      
      // 計測対象のコマンドを送信
      sendPtzCommand(type, newValue);
    });
  };

  // 各PTZ操作タイプに対してイベントリスナーを設定
  setupPtzButtonClick('zoom');
  setupPtzButtonClick('pan');
  setupPtzButtonClick('tilt');

  // スライダーの直接操作は、従来通り計測対象のコマンドを送信
  uiElements.zoomSlider.addEventListener("input", () => sendPtzCommand('zoom', getSliderValue('zoom')));
  uiElements.tiltSlider.addEventListener("input", () => sendPtzCommand('tilt', getSliderValue('tilt')));
  uiElements.panSlider.addEventListener("input", () => sendPtzCommand('pan', getSliderValue('pan')));
  
  uiElements.ptzResetBtn.addEventListener("click", () => {
    const caps = getActiveCaps();
    if (caps.zoom) sendPtzCommand('zoom', caps.zoom.min);
    if (caps.tilt) sendPtzCommand('tilt', 0); 
    if (caps.pan) sendPtzCommand('pan', 0);
  });

  // キーボード操作によるPTZ制御のイベントリスナー
  window.addEventListener('keydown', (event) => {
    if (state.currentRole !== 'receiver' || uiElements.ptzControls.style.display === 'none' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    
    let commandSent = false;
    const caps = getActiveCaps();

    // 各操作タイプの操作量を入力ボックスから取得
    const panStep = parseFloat(document.getElementById('panStepInput').value) || 0;
    const tiltStep = parseFloat(document.getElementById('tiltStepInput').value) || 0;
    const zoomStep = parseFloat(document.getElementById('zoomStepInput').value) || 0;

    switch (event.key) {
        case 'ArrowUp': if (caps.tilt) { sendPtzCommand('tilt', getSliderValue('tilt') + tiltStep); commandSent = true; } break;
        case 'ArrowDown': if (caps.tilt) { sendPtzCommand('tilt', getSliderValue('tilt') - tiltStep); commandSent = true; } break;
        case 'ArrowLeft': if (caps.pan) { sendPtzCommand('pan', getSliderValue('pan') - panStep); commandSent = true; } break;
        case 'ArrowRight': if (caps.pan) { sendPtzCommand('pan', getSliderValue('pan') + panStep); commandSent = true; } break;
        case '+': case 'PageUp': if (caps.zoom) { sendPtzCommand('zoom', getSliderValue('zoom') + zoomStep); commandSent = true; } break;
        case '-': case 'PageDown': if (caps.zoom) { sendPtzCommand('zoom', getSliderValue('zoom') - zoomStep); commandSent = true; } break;
        case 'r': case 'R':
            if (caps.zoom) sendPtzCommand('zoom', caps.zoom.min);
            if (caps.tilt) sendPtzCommand('tilt', 0);
            if (caps.pan) sendPtzCommand('pan', 0);
            commandSent = true;
            break;
    }
    if (commandSent) event.preventDefault();
  });

  // フルスクリーン切替のイベントリスナー
  uiElements.fullscreenBtn1.addEventListener('click', () => { if (!document.fullscreenElement) { uiElements.remoteVideoContainer1.requestFullscreen().catch(err => { alert(`フルスクリーンにできませんでした: ${err.message} (${err.name})`); }); } else { document.exitFullscreen(); } });
  uiElements.fullscreenBtn2.addEventListener('click', () => { if (!document.fullscreenElement) { uiElements.remoteVideoContainer2.requestFullscreen().catch(err => { alert(`フルスクリーンにできませんでした: ${err.message} (${err.name})`); }); } else { document.exitFullscreen(); } });
  document.addEventListener('fullscreenchange', () => { const isFullscreen = !!document.fullscreenElement; uiElements.fullscreenBtn1.textContent = isFullscreen && document.fullscreenElement === uiElements.remoteVideoContainer1 ? '通常表示' : 'フルスクリーン'; uiElements.fullscreenBtn2.textContent = isFullscreen && document.fullscreenElement === uiElements.remoteVideoContainer2 ? '通常表示' : 'フルスクリーン'; });

  // PTZドラッグ操作のイベントリスナー
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let draggedElement = null;
  let throttleTimer = null;
  const THROTTLE_DELAY = 50;
  
  // ドラッグ操作の計測に関する状態を管理
  let dragStartTime = 0;
  let lastDragPosition = { pan: null, tilt: null };

  const handlePtzOnMouseMove = (event) => {
    if (!isDragging) return;
    if (throttleTimer) return;

    throttleTimer = setTimeout(() => {
        const PAN_SENSITIVITY_DIVISOR = 1;
        const TILT_SENSITIVITY_DIVISOR = 1;

        const deltaX = event.clientX - lastMouseX;
        const deltaY = event.clientY - lastMouseY;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

        const caps = getActiveCaps();
        let newPan = getSliderValue('pan');
        let newTilt = getSliderValue('tilt');

        if (caps.pan) {
            newPan += deltaX * (caps.pan.step / PAN_SENSITIVITY_DIVISOR);
            sendUnmeasuredPtzCommand('pan', newPan);
        }
        if (caps.tilt) {
            newTilt -= deltaY * (caps.tilt.step / TILT_SENSITIVITY_DIVISOR);
            sendUnmeasuredPtzCommand('tilt', newTilt);
        }
        
        // 最終位置を保存しておく
        lastDragPosition = { pan: newPan, tilt: newTilt };
        throttleTimer = null;
    }, THROTTLE_DELAY);
  };

  // ホイールによるズーム操作は計測対象とする
  const handlePtzOnWheel = (event) => {
    event.preventDefault();
    const caps = getActiveCaps();
    if (caps.zoom) {
      const ZOOM_SENSITIVITY_DIVISOR = 20; 
      const currentZoom = getSliderValue('zoom');
      const newZoom = currentZoom - event.deltaY * (caps.zoom.step / ZOOM_SENSITIVITY_DIVISOR);
      sendPtzCommand('zoom', newZoom);
    }
  };

  const startDrag = (event) => {
    if (event.button !== 0) return;
    isDragging = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    draggedElement = event.currentTarget;
    draggedElement.classList.add('dragging');
    
    dragStartTime = performance.now();
    lastDragPosition = { pan: getSliderValue('pan'), tilt: getSliderValue('tilt') };
  };

  const stopDrag = () => {
    if (isDragging) {
      isDragging = false;
      if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
      }
      
      if (dragStartTime > 0 && lastDragPosition.pan !== null) {
        // pan と tilt 両方のコマンドを開始時刻付きで送信
        sendPtzCommand('pan', lastDragPosition.pan, { startTime: dragStartTime });
        sendPtzCommand('tilt', lastDragPosition.tilt, { startTime: dragStartTime });
      }
      // リセット
      dragStartTime = 0;
      lastDragPosition = { pan: null, tilt: null };
    }
  };
  
  const setupPtzMouseListeners = (container) => {
    container.addEventListener('mousedown', startDrag);
    container.addEventListener('mousemove', handlePtzOnMouseMove);
    container.addEventListener('wheel', handlePtzOnWheel);
  };

  // mouseup:マウスが押された状態から離された時に発生する
  window.addEventListener('mouseup', stopDrag);
  
  setupPtzMouseListeners(uiElements.remoteVideoContainer1);
  setupPtzMouseListeners(uiElements.remoteVideoContainer2);

  // ArUcoマーカー追跡評価コントロールのイベントリスナー
  const startEvaluationBtn = document.getElementById('startEvaluationBtn');
  const stopEvaluationBtn = document.getElementById('stopEvaluationBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  startEvaluationBtn.addEventListener('click', evaluation.startEvaluation);
  stopEvaluationBtn.addEventListener('click', evaluation.stopEvaluation);
  downloadCsvBtn.addEventListener('click', evaluation.downloadCSV);

  // PTZ操作遅延評価のイベントリスナー
  const startPtzEvaluationBtn = document.getElementById('startPtzEvaluationBtn');
  const stopPtzEvaluationBtn = document.getElementById('stopPtzEvaluationBtn');
  const downloadPtzCsvBtn = document.getElementById('downloadPtzCsvBtn');
  startPtzEvaluationBtn.addEventListener('click', ptzEvaluation.startEvaluation);
  stopPtzEvaluationBtn.addEventListener('click', ptzEvaluation.stopEvaluation);
  downloadPtzCsvBtn.addEventListener('click', ptzEvaluation.downloadCSV);

  // IMU関連イベント
  if (uiElements.connectImuBtn && uiElements.disconnectImuBtn && uiElements.enableImuCheckbox) {
    uiElements.connectImuBtn.addEventListener('click', () => {
      imu.connectImu(); 
      imu.configureImu({ panSign: -1, tiltSign: 1 });
      uiElements.connectImuBtn.disabled = true;
      uiElements.disconnectImuBtn.disabled = false;
    });

    uiElements.disconnectImuBtn.addEventListener('click', () => {
      imu.disconnectImu();
      uiElements.connectImuBtn.disabled = false;
      uiElements.disconnectImuBtn.disabled = true;
    });

    uiElements.enableImuCheckbox.addEventListener('change', (e) => {
      imu.setEnabled(e.target.checked);
    });

    if (uiElements.calibrateImuBtn) {
      uiElements.calibrateImuBtn.addEventListener('click', () => {
        imu.calibrateNow();
        // キャリブレーション時に現在のアクティブPTZターゲットを中央(0)に戻す
        const caps = getActiveCaps();
        if (caps.pan) sendPtzCommand('pan', 0);
        if (caps.tilt) sendPtzCommand('tilt', 0);
      });
    }
    
  }
}

// 初期化処理の実行
updateRoleUI(document.querySelector('input[name="role"]:checked').value);
initializeEventListeners();
populateCameraList();

// コンソールから簡単に呼べるようにエクスポートもグローバルにセット
if (typeof window !== 'undefined') window.setVideoBandwidthKbps = setVideoBandwidthKbps;