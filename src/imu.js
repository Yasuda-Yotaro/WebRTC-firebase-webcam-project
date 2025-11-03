// imu.js

import * as state from './state.js';
import * as ptz from './ptz.js';

let ws = null; // websocketオブジェクトを保持
let enabled = false; // IMU制御の有効/無効フラグ

// IMU制御のパラメータ
const DEFAULT_MIN_INTERVAL_MS = 100; // 最小送信間隔（ms） -> 10Hz ※調整必要
let minIntervalMs = DEFAULT_MIN_INTERVAL_MS;
let lastSentTime = 0;
let lastRawPitch = null; // 最後に受信した生のIMUピッチ値
let lastRawYaw = null; // 最後に受信した生のIMUヨー値
let unitsPerDegree = 7200; // 1度あたりのPTZ値変化量(steps)
let degreeThreshold = 1; // 変化を送信するための最小角度閾値(度)
let residualPitch = 0; // 累積ピッチ変化量
let residualYaw = 0; // 累積ヨー変化量
let panSign = 1; // pan方向の符号
let tiltSign = 1; // tilt方向の符号
let calibration = { pitchOffset: 0, yawOffset: 0 }; // キャリブレーションオフセット

/**
 * IMUデータの形式を想定：{ pitch: number, yaw: number }
 * pitch -> tilt, yaw -> pan にマッピング
 * 受信した値はカメラのrangeに合わせてスケーリングする必要がある
 */

// WebSocketのデフォルトURL
const DEFAULT_WS_URL = 'ws://127.0.0.1:8181'; // 自身のPCを指定

// IMUデータを受信するWebSocketに接続
export function connectImu(url = DEFAULT_WS_URL) {
  if (ws) return;
  ws = new WebSocket(url);
  ws.onopen = () => console.log('IMU WebSocket connected');
  ws.onclose = () => console.log('IMU WebSocket closed');
  ws.onerror = (e) => console.error('IMU WebSocket error', e);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      handleImuData(data);
    } catch (err) {
      console.warn('Invalid IMU message', e.data);
    }
  };
}

// IMUデータの受信を停止してWebSocketを閉じる
export function disconnectImu() {
  if (!ws) return;
  ws.close();
  ws = null;
}

// IMU制御の有効/無効を設定
export function setEnabled(v) {
  enabled = !!v;
}

// IMU制御のパラメータを設定(モジュール外から変更可能にする)
export function configureImu(options = {}) {
  if (options.minIntervalMs !== undefined) minIntervalMs = options.minIntervalMs;
  if (options.deltaRatio !== undefined) deltaRatio = options.deltaRatio;
  if (options.unitsPerDegree !== undefined) unitsPerDegree = options.unitsPerDegree;
  if (options.degreeThreshold !== undefined) degreeThreshold = options.degreeThreshold;
  if (options.panSign !== undefined) panSign = options.panSign;
  if (options.tiltSign !== undefined) tiltSign = options.tiltSign;
}

// IMUの現在の値を基準にキャリブレーションを行う
export function calibrateNow() {
  // set offsets so that current raw values map to zero
  if (lastRawPitch !== null) calibration.pitchOffset = lastRawPitch;
  if (lastRawYaw !== null) calibration.yawOffset = lastRawYaw;
  console.log('IMU calibrated. Offsets:', calibration);
}

// IMUデータからroll,pitch,yawを抽出する関数
function parseImuValues(data) {
  let roll, pitch, yaw;
  if (Array.isArray(data)) {
    [roll, pitch, yaw] = data;
  } else if (data && typeof data === 'object') {
    roll = data.roll;
    pitch = data.pitch !== undefined ? data.pitch : data.p; 
    yaw = data.yaw !== undefined ? data.yaw : data.y; 
  }
  if (typeof pitch !== 'number' || typeof yaw !== 'number') return null;
  return { roll: Number(roll), pitch: Number(pitch), yaw: Number(yaw) };
}

function handleImuData(data) {
  if (!enabled) return;
  const vals = parseImuValues(data);
  if (!vals) return;

  const { pitch, yaw } = vals;
  // IMU may include a timestamp string (ISO 8601) produced by the sender (e.g. C# DateTime.UtcNow.ToString("o")).
  // Parse it to epoch ms for use as the command startTime. If parsing fails, fall back to Date.now().
  const imuTimestampStr = data && (data.timestamp || data.time || data.t); // support several possible fields
  const imuTimestampMs = imuTimestampStr ? Date.parse(imuTimestampStr) : NaN;
  const commandStartTime = Number.isFinite(imuTimestampMs) ? imuTimestampMs : Date.now();

  // pitch/yaw の変化量を PTZ の相対変化に変換する
  const target = state.activePtzTarget || 'camera1';
  const caps = state.ptzCapabilities[target];
  if (!caps) return;

  // clamp raw imu angles
  const clampedPitch = Math.max(-180, Math.min(180, pitch));
  const clampedYaw = Math.max(-180, Math.min(180, yaw));

  // 初回受信では基準値をセットして何もしない
  if (lastRawPitch === null) lastRawPitch = clampedPitch;
  if (lastRawYaw === null) lastRawYaw = clampedYaw;

  const deltaPitch = clampedPitch - lastRawPitch;
  const deltaYaw = clampedYaw - lastRawYaw;

  // 正規化: 角度が360度を超えるジャンプがある場合の補正
  const normDelta = (d) => {
    if (d > 180) return d - 360;
    if (d < -180) return d + 360;
    return d;
  };

  const dPitch = normDelta(deltaPitch);
  const dYaw = normDelta(deltaYaw);

  // 閾値未満は無視
  const now = performance.now();
  residualPitch += dPitch;
  residualYaw += dYaw;

  // レート制限: 最小送信間隔より短い場合は送信しない
  if (now - lastSentTime < minIntervalMs) {
    lastRawPitch = clampedPitch;
    lastRawYaw = clampedYaw;
    return;
  }

  if (Math.abs(residualPitch) < degreeThreshold && Math.abs(residualYaw) < degreeThreshold) {
    lastRawPitch = clampedPitch;
    lastRawYaw = clampedYaw;
    return;
  }

  // 単位変換: degree -> PTZ units
  const applyPitch = residualPitch;
  const applyYaw = residualYaw;

  const deltaTiltUnits = applyPitch * unitsPerDegree * (tiltSign || 1);
  const deltaPanUnits = applyYaw * unitsPerDegree * (panSign || 1);

  console.debug('IMU -> applying delta degrees (pitch,yaw):', applyPitch, applyYaw, 'units:', deltaTiltUnits, deltaPanUnits);

  // 現在の値を取得して相対加算
  if (caps.tilt && Math.abs(deltaTiltUnits) > 0) {
    const slider = document.getElementById('tiltSlider');
    const current = parseFloat(slider.value || 0);
    const targetVal = current + deltaTiltUnits;
    const newVal = targetVal;
    // before send: check channel state
    if (state.ptzChannel?.readyState === 'open') {
      // send measured command so receiver can compute latency when camera reaches target
      // pass the IMU timestamp (epoch ms) as startTime so receiver can compute Date.now() - startTime
      ptz.sendPtzCommand('tilt', newVal, { startTime: commandStartTime });
    } else {
      console.warn('IMU: cannot send tilt - ptzChannel not open');
    }
  }
  if (caps.pan && Math.abs(deltaPanUnits) > 0) {
    const slider = document.getElementById('panSlider');
    const current = parseFloat(slider.value || 0);
    const targetVal = current + deltaPanUnits;
    const newVal = targetVal;
    if (state.ptzChannel?.readyState === 'open') {
      // send measured command so receiver can compute latency when camera reaches target
      ptz.sendPtzCommand('pan', newVal, { startTime: commandStartTime });
    } else {
      console.warn('IMU: cannot send pan - ptzChannel not open');
    }
  }

  // 送信後、残差をリセット
  residualPitch = 0;
  residualYaw = 0;

  lastRawPitch = clampedPitch;
  lastRawYaw = clampedYaw;
  lastSentTime = now;
}
