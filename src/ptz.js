// ptz.js

import * as state from './state.js';
import * as uiElements from './ui-elements.js';
import * as ptzEvaluation from './ptz-evaluation.js';

/**
 * @param {string} target - PTZ操作の対象カメラ（例: 'camera1'）
 * @param {string} type - PTZ操作の種類（例: 'pan', 'tilt', 'zoom'）
 * @param {number} value - PTZの値
 */

// 計測中のコマンドIDと開始時刻を保存するためのマップ
const pendingPtzCommands = new Map();

// コマンドの確認とタイムアウトを管理するオブジェクト
const confirmationManager = {
    pending: {}, // { camera1: { pan: { value, id }, tilt: { value, id } }, camera2: { ... } }
    intervalId: {}, // { camera1: 123, camera2: 456 }

    // 新しいコマンドをpendingに追加し、確認プロセスを開始
    add(target, command, value, commandId) {
        if (!this.pending[target]) {
            this.pending[target] = {};
        }
        this.pending[target][command] = { value, id: commandId }; // コマンドの目標値とIDを保存

        if (!this.intervalId[target]) {
            this.startChecker(target);
        }
    },

    startChecker(target) {
        const checkInterval = 50; // 50msごとに確認
        const maxDuration = 5000; // 最大5秒でタイムアウト
        let elapsedTime = 0;

        this.intervalId[target] = setInterval(() => {
            elapsedTime += checkInterval; // 経過時間を更新
            const track = state.videoTracks[target];
            const pendingCmds = this.pending[target];

            if (!track || !pendingCmds) {
                this.stopChecker(target);
                return;
            }

            const settings = track.getSettings(); // getSettings()：トラックの現在の設定を取得
            const capabilities = track.getCapabilities(); // getCapabilities()：トラックのサポートされている機能を取得
            let allFinished = true; // すべてのコマンドが完了したかどうかを追跡するためのフラグ
            let timedOut = elapsedTime >= maxDuration; // タイムアウト判定(true/false)

            for (const cmdType in pendingCmds) {
                const currentValue = settings[cmdType]; // 現在のカメラ設定値
                const targetValue = pendingCmds[cmdType].value; // 目標値

                // カメラのstep値に基づいて、現実的な許容誤差（tolerance）を計算
                const step = capabilities[cmdType]?.step; // カメラのステップ値
                // insta360 linkの場合、pan,tilt：3600、zoom：1.0
                const tolerance = step ? step * 0.75 : (cmdType === 'zoom' ? 0.05 : 2.0);

                if (Math.abs(currentValue - targetValue) > tolerance) {
                    allFinished = false;
                    break;
                }
            }

            if (allFinished || timedOut) {
                if (timedOut && !allFinished) {
                    console.warn(`SENDER: PTZ command confirmation timed out for ${target}`);
                }
                for (const cmdType in pendingCmds) {
                    const { id } = pendingCmds[cmdType];
                    if (state.ptzChannel?.readyState === 'open') {
                        state.ptzChannel.send(JSON.stringify({
                            type: 'command_ack',
                            id: id,
                            command: cmdType,
                            timedOut: timedOut && !allFinished
                        }));
                    }
                }
                this.stopChecker(target);
            }
        }, checkInterval);
    },

    stopChecker(target) {
        if (this.intervalId[target]) {
            clearInterval(this.intervalId[target]);
            delete this.intervalId[target]; 
            delete this.pending[target]; 
        }
    }
};


export async function applyPtzConstraint(target, type, value) {
    // 高頻度コールをまとめる
    if (!applyPtzConstraint._state) {
        applyPtzConstraint._state = {
            lastApply: 0,
            delay: 50, // ms
            pending: {} // { '<target>#<type>': { target, type, value } }
        };
    }
    const s = applyPtzConstraint._state;
    const key = `${target}#${type}`;
    s.pending[key] = { target, type, value };

    const doApply = async (entry) => {
        const track = state.videoTracks[entry.target];
        if (document.visibilityState !== 'visible' || !track || track.readyState !== 'live') {
            console.warn(`SENDER: Cannot apply PTZ to ${entry.target}. Page not visible or track not live.`);
            return;
        }
        try {
            await track.applyConstraints({ advanced: [{ [entry.type]: entry.value }] });
        } catch (err) {
            console.error(`SENDER: Error applying ${entry.type} constraint to ${entry.target}:`, err);
        }
    };

    const now = performance.now();
    if (now - s.lastApply >= s.delay) {
        // すぐに適用するべき最新のエントリを取得
        const entries = Object.values(s.pending);
        s.pending = {};
        s.lastApply = now;
        entries.forEach(e => doApply(e));
    } else {
        // 既にタイマーがある場合は何もしない。タイマーでまとめて送る
        if (!s._timer) {
            const remaining = s.delay - (now - s.lastApply);
            s._timer = setTimeout(() => {
                s._timer = null;
                const entries = Object.values(s.pending);
                s.pending = {};
                s.lastApply = performance.now();
                entries.forEach(e => doApply(e));
            }, remaining);
        }
    }
}

// PTZ操作に関するUIを更新する関数
export function updateReceiverPtzControls(target) {
  console.log(`RECEIVER: Updating PTZ controls for ${target}`);
  state.setActivePtzTarget(target);
  const capabilities = state.ptzCapabilities[target];

  ['zoom', 'pan', 'tilt'].forEach(type => {
    const isSupported = !!(capabilities && capabilities[type]); // boolean型に変換してサポート状況を確認
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
      valueDisplay.textContent = parseFloat(slider.value).toFixed(2); //slider.valueは文字列なため数値に変換してから表示
    } else if (valueDisplay) {
      valueDisplay.textContent = 'N/A';
    }
  });
}

// コマンドを送信できるかを確認する関数
function canSendCommand(type, target) {
    if (state.peerConnection?.connectionState !== 'connected' || state.ptzChannel?.readyState !== 'open') {
        console.warn(`RECEIVER: Cannot send command. Connection not ready.`);
        return false;
    }
    const capabilities = state.ptzCapabilities[target];
    if (!capabilities || !capabilities[type]) {
        console.warn(`RECEIVER: PTZ type '${type}' is not supported for ${target}.`);
        return false;
    }
    return true;
}

// 測定不要のPTZコマンドを送信する関数
export function sendUnmeasuredPtzCommand(type, value) {
    const target = state.activePtzTarget;
    if (!canSendCommand(type, target)) return;

    const { min, max } = state.ptzCapabilities[target][type];
    const clampedValue = Math.max(min, Math.min(max, value)); // 範囲内に制限
    
    const command = { type: 'command', target, command: type, value: clampedValue };

    try {
        state.ptzChannel.send(JSON.stringify(command));
        document.getElementById(`${type}Slider`).value = clampedValue;
        document.getElementById(`${type}Value`).textContent = clampedValue.toFixed(2);
    } catch (e) {
        console.error("RECEIVER: Error sending unmeasured command:", e);
    }
}

// 測定付きのPTZコマンドを送信する関数
export function sendPtzCommand(type, value, options = {}) {
    const target = state.activePtzTarget;
    if (!canSendCommand(type, target)) return; // 送信可能か確認

    const { min, max } = state.ptzCapabilities[target][type];
    const clampedValue = Math.max(min, Math.min(max, value)); // 範囲内に制限

    const commandId = `${performance.now()}-${Math.random()}`; // 一意なコマンドIDを生成 
    const command = { type: 'command', target, command: type, value: clampedValue, id: commandId };

    try {
        const effectiveStartTime = options.startTime || performance.now();
        pendingPtzCommands.set(commandId, effectiveStartTime);

        state.ptzChannel.send(JSON.stringify(command));
        document.getElementById(`${type}Slider`).value = clampedValue;
        document.getElementById(`${type}Value`).textContent = clampedValue.toFixed(2);
    } catch (e) {
        console.error("RECEIVER: Error sending measured command:", e);
    }
}

// 送信側でDataChannelを処理する関数
export function setupPtzDataChannel() {
    const channel = state.peerConnection.createDataChannel('ptz'); // 'ptz'というラベルでDataChannelを作成
    state.setPtzChannel(channel);
    
    channel.onopen = () => {
        console.log("SENDER: DataChannel is open. Sending capabilities...");
        const ptzCaps = {};
        for (const cameraName in state.videoTracks) {
            const track = state.videoTracks[cameraName];
            if (track) {
                const caps = track.getCapabilities();
                ptzCaps[cameraName] = { zoom: caps.zoom, pan: caps.pan, tilt: caps.tilt };
            }
        }
        channel.send(JSON.stringify({ type: 'capabilities', data: ptzCaps }));
    };
    
    channel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'command' && state.videoTracks[msg.target]) { // 受信メッセージがコマンドの場合かつ対象トラックが存在する場合
            applyPtzConstraint(msg.target, msg.command, msg.value); // 送信側でPTZ制約を適用
            if (msg.id) {
                confirmationManager.add(msg.target, msg.command, msg.value, msg.id); //目標値に到達したかを確認
            }
        }
    };
    
    channel.onclose = () => {
        console.log("SENDER: DataChannel is closed.");
        confirmationManager.stopChecker('camera1');
        confirmationManager.stopChecker('camera2');
    };
    channel.onerror = (error) => console.error("SENDER: DataChannel error:", error);
}

// 受信側でDataChannelを処理する関数
export function handleReceiverDataChannel(event) {
    if (event.channel.label !== 'ptz') return;
    
    const channel = event.channel;
    state.setPtzChannel(channel); // 他の関数から参照できるように保存
    
    channel.onopen = () => console.log("RECEIVER: DataChannel is open.");
    channel.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'capabilities') {
            state.setPtzCapabilities(msg.data);
            if (!msg.data.camera2) {
                uiElements.ptzTargetCamera2Label.style.display = 'none';
                if (state.activePtzTarget === 'camera2') {
                    document.querySelector('input[name="ptzTarget"][value="camera1"]').checked = true;
                    state.setActivePtzTarget('camera1');
                }
            } else {
                 uiElements.ptzTargetCamera2Label.style.display = 'inline';
            }
            uiElements.ptzControls.style.display = 'block';
            document.getElementById('ptzEvaluationControl').style.display = 'block';
            updateReceiverPtzControls(state.activePtzTarget);

        } else if (msg.type === 'command_ack' && pendingPtzCommands.has(msg.id)) {
            const startTime = pendingPtzCommands.get(msg.id);
            const ptzLatency = performance.now() - startTime;
            const timedOut = msg.timedOut || false;

            console.log(`PTZ Latency (${msg.command}): ${ptzLatency.toFixed(2)} ms, Timed Out: ${timedOut}`);
            
            ptzEvaluation.logData({ ptzLatency, command: msg.command, timedOut: timedOut ? 1 : 0 });
            
            pendingPtzCommands.delete(msg.id);
        }
    };
    channel.onclose = () => {
        uiElements.ptzControls.style.display = 'none';
        document.getElementById('ptzEvaluationControl').style.display = 'none';
        pendingPtzCommands.clear();
    };
    channel.onerror = (error) => console.error("RECEIVER: DataChannel error:", error);
}