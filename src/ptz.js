// ptz.js

import * as state from './state.js';
import * as uiElements from './ui-elements.js';
import { listenForMovementEnd } from './movement-listener.js';
import { measureClockOffset } from './clock-sync.js'; 
import * as evaluation from './evaluation.js'; 

/**
 * 送信者側で、指定されたカメラにPTZの制約を適用する。
 * @param {string} target - 'camera1' or 'camera2'
 * @param {string} type - 'pan', 'tilt', or 'zoom'
 * @param {number} value - 適用する値
 */
export async function applyPtzConstraint(target, type, value) {
  const track = state.videoTracks[target]; // 操作対象のカメラ（target）に対応するビデオトラックを取得
  if (document.visibilityState !== 'visible' || !track || track.readyState !== 'live') {
    console.warn(`SENDER: Cannot apply PTZ to ${target}. Page not visible or track not live.`);
    return;
  }
  
  try {
    await track.applyConstraints({ advanced: [{ [type]: value }] }); // PTZの制約を適用
  } catch (err) {
    console.error(`SENDER: Error applying ${type} constraint to ${target}:`, err);
  }
}

/**
 * 受信者側のPTZコントロールUIを指定されたカメラの機能で更新する。
 * @param {string} target - 'camera1' or 'camera2'
 */
export function updateReceiverPtzControls(target) {
  console.log(`RECEIVER: Updating PTZ controls for ${target}`);
  state.setActivePtzTarget(target);
  const capabilities = state.ptzCapabilities[target]; // 送信側から送られてきた、対象カメラの機能情報（capabilities）を取得

  ['zoom', 'pan', 'tilt'].forEach(type => {
    const isSupported = !!(capabilities && capabilities[type]);
    const slider = document.getElementById(`${type}Slider`);
    const valueDisplay = document.getElementById(`${type}Value`);
    
    document.querySelectorAll(`button[id$="${type.charAt(0).toUpperCase() + type.slice(1)}Btn"]`).forEach(btn => btn.disabled = !isSupported);
    if(slider) slider.disabled = !isSupported;

    if (isSupported) {
      const { min, max, step } = capabilities[type];
      slider.min = min;
      slider.max = max;
      slider.step = step;
      const currentValue = parseFloat(slider.value);
      slider.value = Math.max(min, Math.min(max, currentValue));
      valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
    } else if (valueDisplay) {
      valueDisplay.textContent = 'N/A';
    }
  });
}

/**
 * 受信者側からPTZコマンドを送信する。
 * @param {string} type - 'pan', 'tilt', or 'zoom'
 * @param {number} value - 送信する値
 */
export function sendPtzCommand(type, value, timestamp = null) {
  const target = state.activePtzTarget;
  const capabilities = state.ptzCapabilities[target];
  
  if (state.peerConnection?.connectionState !== 'connected' || state.ptzChannel?.readyState !== 'open') {
    console.warn(`RECEIVER: Cannot send command. Connection not ready.`);
    return;
  }
  if (!capabilities || !capabilities[type]) {
    console.warn(`RECEIVER: PTZ type '${type}' is not supported for ${target}.`);
    return;
  }

  const { min, max } = capabilities[type];
  const clampedValue = Math.max(min, Math.min(max, value));
  const command = { type: 'command', target, command: type, value: clampedValue, timestamp };
  
  try {
    state.ptzChannel.send(JSON.stringify(command));
    document.getElementById(`${type}Slider`).value = clampedValue;
    document.getElementById(`${type}Value`).textContent = clampedValue.toFixed(2);
  } catch (e) {
    console.error("RECEIVER: Error sending command via DataChannel:", e);
  }
}

/**
 * 送信者側でPTZコントロール用のデータチャネルを設定する。
 */
export function setupPtzDataChannel() {
    const channel = state.peerConnection.createDataChannel('ptz');
    state.setPtzChannel(channel);
    
    channel.onopen = () => {
        console.log("SENDER: DataChannel is open. Sending capabilities...");
        const ptzCaps = {};
        
        // videoTracks に存在するカメラの機能だけを収集
        for (const cameraName in state.videoTracks) {
            const track = state.videoTracks[cameraName];
            if (track) {
                const caps = track.getCapabilities();
                ptzCaps[cameraName] = {
                    zoom: caps.zoom,
                    pan: caps.pan,
                    tilt: caps.tilt
                };
            }
        }
        
        channel.send(JSON.stringify({ type: 'capabilities', data: ptzCaps }));
    };
    
    channel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'command' && state.videoTracks[msg.target]) {
            applyPtzConstraint(msg.target, msg.command, msg.value);
            const track = state.videoTracks[msg.target];
            if (track && msg.timestamp) {
                listenForMovementEnd(track, msg.command, msg.value, msg.timestamp, channel);
            }
        } else if (msg.type === 'ping') {
            // ★ 追加: pingメッセージを受信したら、自分の時刻を加えてpongを返す
            const t2 = performance.now();
            channel.send(JSON.stringify({ type: 'pong', t1: msg.t1, t2 }));
        }
    };
    
    channel.onclose = () => console.log("SENDER: DataChannel is closed.");
    channel.onerror = (error) => console.error("SENDER: DataChannel error:", error);
}

/**
 * 受信者側でデータチャネルイベントを処理する。
 * @param {RTCDataChannelEvent} event 
 */
export function handleReceiverDataChannel(event) {
    if (event.channel.label !== 'ptz') return;
    
    const channel = event.channel;
    state.setPtzChannel(channel);
    
    channel.onopen = async() => {
        console.log("RECEIVER: DataChannel is open.");
        const offset = await measureClockOffset(channel);
        state.setClockOffset(offset);
    };
    channel.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'capabilities') {
            state.setPtzCapabilities(msg.data);
            
            // 2台目のカメラの機能が存在しない場合はUIを非表示にする
            if (!msg.data.camera2) {
                uiElements.ptzTargetCamera2Label.style.display = 'none';
                // もしカメラ2が選択されていたら、カメラ1に戻す
                if (state.activePtzTarget === 'camera2') {
                    document.querySelector('input[name="ptzTarget"][value="camera1"]').checked = true;
                    state.setActivePtzTarget('camera1');
                }
            } else {
                 uiElements.ptzTargetCamera2Label.style.display = 'inline';
            }
            
            uiElements.ptzControls.style.display = 'block';
            updateReceiverPtzControls(state.activePtzTarget);
        } else if (msg.type === 'movement_finished') {
            // ★ 追加: 送信側から動作完了通知が届いたら、最終的な遅延を計算・記録する
            const offset = state.getClockOffset();
            const startTime = msg.mouseTimestamp;
            const endTimeOnSender = msg.movementEndTime;

            // 送信側の完了時刻を、受信側の時間軸に補正する
            const correctedEndTime = endTimeOnSender - offset;
            const latency = correctedEndTime - startTime;

            console.log(`[絶対遅延記録] command: ${msg.command}, latency: ${latency.toFixed(2)} ms`);

            evaluation.logData({
                command: msg.command,
                targetValue: msg.targetValue,
                latency: latency
            });
        }
    };
    channel.onclose = () => {
        uiElements.ptzControls.style.display = 'none';
    };
    channel.onerror = (error) => console.error("RECEIVER: DataChannel error:", error);
}