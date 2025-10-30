// state.js

// 状態を保持する変数
export let peerConnection; // RTCPeerConnectionオブジェクト
export let localStreams = []; // ローカルのメディアストリーム配列
export let callDocRef; // Firestoreの通話ドキュメント参照
export let ptzChannel; // PTZ制御用のデータチャネル
export let ptzCapabilities = {}; // PTZカメラの制御能力情報
export let videoTracks = {}; // ビデオトラック情報
export let remoteTracks = {}; // リモートトラック情報
export let statsInterval; // 情報収集のインターバル
export let recordedStats = []; // 録画されたスタッツ
export let isRecordingStats = false; // 録画中かのフラグ
export let currentRole = "sender";
export let lastStatsReport = null;
export let resolutionUpdateInterval = null;
export let activePtzTarget = 'camera1';


// 録画関連の状態
export let mediaRecorders = { camera1: null, camera2: null };
export let recordedChunks = { camera1: [], camera2: [] };
export let isRecording = { camera1: false, camera2: false };


// 状態を変更するための関数
export function setPeerConnection(pc) { peerConnection = pc; }
export function setLocalStreams(streams) { localStreams = streams; }
export function setCallDocRef(ref) { callDocRef = ref; }
export function setPtzChannel(channel) { ptzChannel = channel; }
export function setPtzCapabilities(capabilities) { ptzCapabilities = capabilities; }
export function setVideoTracks(tracks) { videoTracks = tracks; }
export function setRemoteTracks(tracks) { remoteTracks = tracks; }
export function setStatsInterval(interval) { statsInterval = interval; }
export function setRecordedStats(stats) { recordedStats = stats; }
export function setIsRecordingStats(isRecording) { isRecordingStats = isRecording; }
export function setCurrentRole(role) { currentRole = role; }
export function setLastStatsReport(report) { lastStatsReport = report; }
export function setResolutionUpdateInterval(interval) { resolutionUpdateInterval = interval; }
export function setActivePtzTarget(target) { activePtzTarget = target; }
export function setMediaRecorder(target, recorder) { mediaRecorders[target] = recorder; }
export function setRecordedChunks(target, chunks) { recordedChunks[target] = chunks; }
export function setIsRecording(target, recording) { isRecording[target] = recording; }
