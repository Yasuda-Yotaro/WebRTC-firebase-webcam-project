// ui.js

import * as state from './state.js';
import * as uiElements from './ui-elements.js';

/**
 * UIの状態を初期状態にリセットする。
 */
export function resetUI() {
  uiElements.localVideo1.srcObject = null;
  uiElements.localVideo2.srcObject = null;
  uiElements.remoteVideo1.srcObject = null;
  uiElements.remoteVideo2.srcObject = null;
  uiElements.localVideo1.style.display = 'none';
  uiElements.localVideo2.style.display = 'none';
  uiElements.remoteVideoContainer1.style.display = 'none';
  uiElements.remoteVideoContainer2.style.display = 'none';
  uiElements.resolutionDisplay1.style.display = 'none';
  uiElements.resolutionDisplay2.style.display = 'none';

  uiElements.ptzControls.style.display = "none";
  uiElements.callControls.style.display = "none";
  uiElements.statsControls.style.display = "none";
  uiElements.arucoControls.style.display = 'none';

  uiElements.callIdDisplay.textContent = "";
  uiElements.callIdInput.value = "";
  uiElements.copyCallIdBtn.textContent = "コピー";

  uiElements.startCameraBtn.disabled = false;
  uiElements.joinCallBtn.disabled = false;

  uiElements.statsDisplay.textContent = "";
  state.setRecordedStats([]);
  state.setLastStatsReport(null);
  uiElements.startStatsRecordingBtn.disabled = false;
  uiElements.stopStatsRecordingBtn.disabled = true;
  uiElements.downloadStatsBtn.disabled = true;
  
  // Reset ArUco tracking UI
  uiElements.startArucoTrackingBtn.disabled = false;
  uiElements.stopArucoTrackingBtn.disabled = true;
  uiElements.arucoTargetSelect.disabled = false;
  uiElements.arucoTrackingStatus.textContent = "";

  // Reset recording UI for both cameras
  ['camera1', 'camera2'].forEach(target => {
      if (state.mediaRecorders[target] && state.mediaRecorders[target].state !== 'inactive') {
          state.mediaRecorders[target].stop();
      }
      state.setMediaRecorder(target, null);
      state.setRecordedChunks(target, []);
      state.setIsRecording(target, false);
  });
  
  uiElements.startRecordingBtn1.disabled = false;
  uiElements.stopRecordingBtn1.disabled = true;
  uiElements.downloadVideoBtn1.disabled = true;
  uiElements.recordingStatus1.textContent = "";
  
  uiElements.startRecordingBtn2.disabled = false;
  uiElements.stopRecordingBtn2.disabled = true;
  uiElements.downloadVideoBtn2.disabled = true;
  uiElements.recordingStatus2.textContent = "";

  if (state.ptzChannel) {
    state.ptzChannel.close();
    state.setPtzChannel(null);
  }
  
  if (state.resolutionUpdateInterval) {
    clearInterval(state.resolutionUpdateInterval);
    state.setResolutionUpdateInterval(null);
  }
}

/**
 * 役割（送信者/受信者）の変更に応じてUIを更新する。
 * @param {string} role - 'sender' または 'receiver'
 */
export function updateRoleUI(role) {
  state.setCurrentRole(role);
  uiElements.senderControls.style.display = role === "sender" ? "block" : "none";
  uiElements.receiverControls.style.display = role === "receiver" ? "block" : "none";
  resetUI();
}

/**
 * 利用可能なカメラデバイスをリストアップし、選択メニューを生成する。
 */
export async function populateCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    uiElements.cameraSelect1.innerHTML = '';
    uiElements.cameraSelect2.innerHTML = '';

    if (videoDevices.length === 0) {
      const message = '<option>カメラが見つかりません</option>';
      uiElements.cameraSelect1.innerHTML = message;
      uiElements.cameraSelect2.innerHTML = message;
      uiElements.cameraSelect1.disabled = true;
      uiElements.cameraSelect2.disabled = true;
      uiElements.startCameraBtn.disabled = true;
      return;
    }

    videoDevices.forEach((device, index) => {
      const option1 = document.createElement('option');
      option1.value = device.deviceId;
      option1.text = device.label || `カメラ ${index + 1}`;
      uiElements.cameraSelect1.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = device.deviceId;
      option2.text = device.label || `カメラ ${index + 1}`;
      uiElements.cameraSelect2.appendChild(option2);
    });
    
    if (videoDevices.length > 1) {
        uiElements.cameraSelect2.selectedIndex = 1;
    }

    uiElements.cameraSelect1.disabled = false;
    uiElements.cameraSelect2.disabled = videoDevices.length < 2;
    uiElements.startCameraBtn.disabled = false;
    
    // カメラ台数セレクターの状態に応じてUIを更新
    updateCameraCountUI();

  } catch (error) {
    console.error("Error enumerating devices:", error);
    alert("カメラデバイスの取得に失敗しました。");
  }
}

/**
 * カメラ台数の選択に応じてUIを更新する。
 */
export function updateCameraCountUI() {
    const count = parseInt(uiElements.cameraCountSelect.value, 10);
    uiElements.cameraSelect2Container.style.display = count === 2 ? 'block' : 'none';
}