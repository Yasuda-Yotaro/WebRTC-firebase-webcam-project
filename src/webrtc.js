// webrtc.js

import { db } from "./firebase-config.js";

/*
  collection:Firestoreのコレクションへの参照を作成する
  doc:Firestoreのドキュメントへの参照を作成する
  setDoc:Firestoreのドキュメントにデータを書き込む
  getDoc:Firestoreのドキュメントからデータを取得する
  onSnapshot:ドキュメントの変更をリアルタイムで監視する
  deleteDoc:Firestoreのドキュメントを削除する
*/
import { collection, doc, setDoc, getDoc, onSnapshot, deleteDoc } from "firebase/firestore";
import * as state from './state.js';
import * as ui from './ui.js';
import * as uiElements from './ui-elements.js';
import * as ptz from './ptz.js';
import { stopStatsRecording, updateResolutionDisplay, startStatsRecording } from './stats.js';
import { stopRecording } from './recording.js';
import { stop as stopArucoTracking } from './aruco.js';

// 解像度のプリセット
export const RESOLUTIONS = {
  vga: { width: 640, height: 360 },
  qhd: { width: 960, height: 540 },
  hd: { width: 1280, height: 720 },
  fhd: { width: 1920, height: 1080 },
  fourK: { width: 3840, height: 2160 },
};

// WebRTC接続設定
export const RTC_CONFIGURATION = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "turn:a.relay.metered.ca:80", username: "3c2899b6892a0dd428438fa2", credential: "UjVDP6QSI1bu0yiq" },
    { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "3c2899b6892a0dd428438fa2", credential: "UjVDP6QSI1bu0yiq" },
    { urls: "turn:a.relay.metered.ca:443", username: "3c2899b6892a0dd428438fa2", credential: "UjVDP6QSI1bu0yiq" },
    { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "3c2899b6892a0dd428438fa2", credential: "UjVDP6QSI1bu0yiq" },
  ],
  iceCandidatePoolSize: 10, // 事前に収集しておくICE Candidateの数を設定
};

/**
 * RTCPeerConnectionインスタンスを作成し、イベントハンドラを設定する。
 * @returns {RTCPeerConnection} RTCPeerConnectionのインスタンス
 */
function createPeerConnection() {
  const pc = new RTCPeerConnection(RTC_CONFIGURATION);
  // 接続状態が変化したときに実行されるイベントハンドラを設定
  pc.onconnectionstatechange = () => {
    console.log(`PeerConnection state changed to: ${pc.connectionState}`);
    const isConnected = pc.connectionState === 'connected';
    uiElements.statsControls.style.display = isConnected ? 'block' : 'none'; // 接続が確立したら、統計情報の記録を開始するUIを表示

    // 接続が確立したら、統計情報の記録を開始
    if (isConnected) {
      startStatsRecording();
    }

    // 受信側（receiver）で接続が確立した場合、1秒ごとに解像度表示を更新するタイマーを開始
    if (isConnected && state.currentRole === 'receiver') {
      if (!state.resolutionUpdateInterval) {
        const interval = setInterval(updateResolutionDisplay, 1000);
        state.setResolutionUpdateInterval(interval);
      }
    } else {
      if (state.resolutionUpdateInterval) {
        clearInterval(state.resolutionUpdateInterval);
        state.setResolutionUpdateInterval(null);
      }
      uiElements.resolutionDisplay1.style.display = 'none';
      uiElements.resolutionDisplay2.style.display = 'none';
    }

    if (!isConnected) {
      stopStatsRecording();
      stopRecording('camera1');
      stopRecording('camera2');
    }
  };

  return pc; // 設定済みのRTCPeerConnectionインスタンスを返す
}

/**
 * SDP（Session Description Protocol）を操作して、すべてのビデオストリームで指定されたコーデックを用いる。
 * @param {string} sdp - 元のSDP
 * @param {string} codecName - 優先するコーデック名 (e.g., 'H264', 'VP9')
 * @returns {string} 変更されたSDP
 */
function preferCodec(sdp, codecName) {
  const lines = sdp.split('\r\n');
  const mLineIndices = [];
  
  lines.forEach((line, index) => {
    if (line.startsWith('m=video')) {
      mLineIndices.push(index);
    }
  });

  if (mLineIndices.length === 0) {
    return sdp;
  }

  const codecRegex = new RegExp(`a=rtpmap:(\\d+) ${codecName}/90000`, 'i');
  const codecLine = lines.find(line => codecRegex.test(line));
  
  if (!codecLine) {
    return sdp;
  }
  
  const codecPayload = codecLine.match(codecRegex)[1];

  mLineIndices.forEach(mLineIndex => {
    const mLineParts = lines[mLineIndex].split(' ');
    
    if (mLineParts.slice(3).includes(codecPayload)) {
        const newPayloadOrder = [
          codecPayload,
          ...mLineParts.slice(3).filter(pt => pt !== codecPayload)
        ];
        
        lines[mLineIndex] = [
          ...mLineParts.slice(0, 3),
          ...newPayloadOrder
        ].join(' ');
    }
  });

  return lines.join('\r\n');
}


/**
 * 自身のICE Candidateをリッスンし、Firestoreに保存する。
 * @param {RTCPeerConnection} pc - RTCPeerConnectionインスタンス
 * @param {CollectionReference} candidateCollection - ICE Candidateを保存するFirestoreコレクション
 */
function handleIceCandidates(pc, candidateCollection) {
  pc.onicecandidate = event => {
    if (event.candidate) {
      setDoc(doc(candidateCollection), event.candidate.toJSON()); // 見つかったCandidateをJSON形式に変換し、Firestoreの指定されたコレクションに保存する
    }
  };
}

/**
 * 相手のICE Candidateをリッスンし、PeerConnectionに追加する。
 * @param {CollectionReference} candidateCollection - 相手のICE Candidateが保存されているFirestoreコレクション
 */
function listenForRemoteCandidates(candidateCollection) {
  onSnapshot(candidateCollection, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added" && state.peerConnection) {
        const candidate = new RTCIceCandidate(change.doc.data()); //
        state.peerConnection.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate:", e)); //
      }
    });
  });
}

/**
 * 通話を終了し、すべてのリソースをクリーンアップする。
 */
export async function hangUp() {
  stopArucoTracking();
  stopStatsRecording();
  // 両方の録画を停止
  stopRecording('camera1');
  stopRecording('camera2');
  
  if (state.resolutionUpdateInterval) {
    clearInterval(state.resolutionUpdateInterval);
    state.setResolutionUpdateInterval(null);
  }

  if (state.localStreams) {
    state.localStreams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    state.setLocalStreams([]);
  }

  if (state.peerConnection) {
    state.peerConnection.close();
    state.setPeerConnection(null);
  }

  if (state.callDocRef) {
    await deleteDoc(state.callDocRef).catch(e => console.error("Error deleting document: ", e));
    state.setCallDocRef(null);
  }
  
  state.setVideoTracks({});
  state.setRemoteTracks({});
  ui.resetUI();
}

/**
 * 送信者（Sender）として通話を開始する。
 */
export async function startCall() {
  uiElements.startCameraBtn.disabled = true; // 二重クリック防止のため、ボタンを無効化
  const cameraCount = parseInt(uiElements.cameraCountSelect.value, 10); // 選択されたカメラ台数を取得
  const selectedResolution = uiElements.resolutionSelect.value; // 選択された解像度を取得
  const selectedFramerate = parseInt(uiElements.framerateSelect.value, 10);  // 選択されたフレームレートを取得
  const selectedCodec = uiElements.codecSelect.value; // 選択されたビデオコーデックを取得

  // カメラに要求する共通の設定（解像度、フレームレート、PTZの有効化）を作成
  const commonConstraints = {
    ...RESOLUTIONS[selectedResolution], 
    frameRate: { ideal: selectedFramerate},
    pan: true, 
    tilt: true, 
    zoom: true 
  };
  
  const streams = [];
  const tracks = {};

  try {
    // カメラ1のストリームを取得
    const selectedCameraId1 = uiElements.cameraSelect1.value;
    const constraints1 = { video: { deviceId: { exact: selectedCameraId1 }, ...commonConstraints }, audio: false };
    const stream1 = await navigator.mediaDevices.getUserMedia(constraints1); // ブラウザの機能を使って、指定した設定（constraints1）でカメラ1の映像を取得
    streams.push(stream1); // 取得したストリームとビデオトラックを、後で管理しやすいように配列やオブジェクトに保存
    tracks.camera1 = stream1.getVideoTracks()[0];
    uiElements.localVideo1.srcObject = stream1; // 取得したカメラ映像を、HTMLの<video>要素に表示
    uiElements.localVideo1.style.display = 'block';

    // カメラ台数が2台選択されている場合は、同様にカメラ2の映像も取得・表示
    if (cameraCount === 2) {
        const selectedCameraId2 = uiElements.cameraSelect2.value;
        const constraints2 = { video: { deviceId: { exact: selectedCameraId2 }, ...commonConstraints }, audio: false };
        const stream2 = await navigator.mediaDevices.getUserMedia(constraints2);
        streams.push(stream2);
        tracks.camera2 = stream2.getVideoTracks()[0];
        uiElements.localVideo2.srcObject = stream2;
        uiElements.localVideo2.style.display = 'block';
    } else {
        uiElements.localVideo2.srcObject = null;
        uiElements.localVideo2.style.display = 'none';
    }
    
    state.setLocalStreams(streams);
    state.setVideoTracks(tracks);

    const pc = createPeerConnection(); // RTCPeerConnectionインスタンスを生成
    state.setPeerConnection(pc); 
    // 取得したすべてのストリームのトラックをPeerConnectionに追加
    streams.forEach(stream => {
        stream.getTracks().forEach(track => state.peerConnection.addTrack(track, stream));
    });
    
    ptz.setupPtzDataChannel(); // PTZ制御用のデータチャネルをセットアップ

    const callRef = doc(collection(db, "calls")); // Firestoreの"calls"コレクションに新しいドキュメントを作成
    state.setCallDocRef(callRef); //
    const offerCandidates = collection(callRef, "offerCandidates"); // offerCandidatesとanswerCandidatesというサブコレクションを作成
    const answerCandidates = collection(callRef, "answerCandidates");

    handleIceCandidates(state.peerConnection, offerCandidates); // 自身のICE Candidateを収集してFirestoreに保存
    listenForRemoteCandidates(answerCandidates); // 相手のICE CandidateをFirestoreから取得してPeerConnectionに追加

    const offer = await state.peerConnection.createOffer(); // 通話を始めるためのオファー（Offer）SDPを生成
    const modifiedSDP = preferCodec(offer.sdp, selectedCodec); // 生成したオファーSDPに、選択されたコーデックを優先する変更を加える
    await state.peerConnection.setLocalDescription({ type: offer.type, sdp: modifiedSDP }); //　変更後のオファーを、自身のRTCPeerConnectionのローカル設定として適用

    // 生成したオファーとカメラ台数を、Firestoreの通話ドキュメントに保存
    await setDoc(callRef, { 
      offer: { type: offer.type, sdp: modifiedSDP },
      cameraCount: cameraCount 
    });

    uiElements.callIdDisplay.textContent = callRef.id; // 画面にCall IDを表示
    uiElements.callControls.style.display = "block";
    
    // Firestoreの通話ドキュメントにanswerが追加されたら、それを取得してPeerConnectionのリモート設定として適用
    onSnapshot(callRef, snapshot => {
      const data = snapshot.data();
      if (data?.answer && state.peerConnection && !state.peerConnection.currentRemoteDescription) {
        state.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

  } catch (error) {
    console.error("Error starting camera or creating call:", error);
    alert("カメラへのアクセスに失敗しました。");
    ui.resetUI();
  }
}

/**
 * 受信者（Receiver）として通話に参加する。
 */
export async function joinCall() {
  const callId = uiElements.callIdInput.value.trim();
  if (!callId) {
    alert("Call ID を入力してください。");
    return;
  }
  uiElements.joinCallBtn.disabled = true;

  try {
    const callRef = doc(db, "calls", callId); // 入力されたCall IDを使って、Firestoreの通話ドキュメントへの参照を作成
    state.setCallDocRef(callRef);
    const callSnapshot = await getDoc(callRef); // ドキュメントのデータを取得
    const callData = callSnapshot.data();

    if (!callSnapshot.exists() || !callData.offer) {
      alert("無効なCall IDです。");
      ui.resetUI();
      return;
    }
    
    const offer = callData.offer; // ドキュメントから発信者側のオファー情報を取得
    const cameraCount = callData.cameraCount || 2; // ドキュメントからカメラ台数を取得

    // UIをカメラ台数に合わせて調整
    uiElements.remoteVideoContainer2.style.display = cameraCount === 2 ? 'inline-block' : 'none';
    uiElements.ptzTargetCamera2Label.style.display = cameraCount === 2 ? 'inline' : 'none';


    const pc = createPeerConnection();
    state.setPeerConnection(pc);
    
    const offerCandidates = collection(callRef, "offerCandidates");
    const answerCandidates = collection(callRef, "answerCandidates");

    const videoElements = [uiElements.remoteVideo1, uiElements.remoteVideo2];
    const containerElements = [uiElements.remoteVideoContainer1, uiElements.remoteVideoContainer2];
    const resolutionDisplays = [uiElements.resolutionDisplay1, uiElements.resolutionDisplay2];
    const remoteTracks = {};
    let videoIndex = 0;
    const cameraNames = ['camera1', 'camera2']; 

    // 相手から映像や音声のトラックが送られてきたときに呼び出される処理
    state.peerConnection.ontrack = event => {
      if (event.track.kind === 'video' && videoIndex < cameraCount) { 
        videoElements[videoIndex].srcObject = event.streams[0]; // videoElements配列から対応する<video>要素にストリームを設定して表示
        containerElements[videoIndex].style.display = 'inline-block'; // コンテナを表示

        const cameraName = cameraNames[videoIndex]; // camera1, camera2の名前を順に取得
        remoteTracks[event.track.id] = { 
            displayElement: resolutionDisplays[videoIndex],
            name: cameraName
        };

        videoIndex++; // 次のビデオトラックを次の<video>要素に割り当てるため、インデックスを増やす
      }
    };
    state.setRemoteTracks(remoteTracks);
    
    state.peerConnection.ondatachannel = ptz.handleReceiverDataChannel; // 相手からデータチャネル（PTZ制御用）の接続要求があった場合の処理を設定
    
    handleIceCandidates(state.peerConnection, answerCandidates); // 自分のICE CandidateをanswerCandidatesに保存し、相手のICE CandidateをofferCandidatesから取得する設定
    listenForRemoteCandidates(offerCandidates);

    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer)); // Firestoreから取得した発信者のオファーを、リモート設定として適用
    
    const answer = await state.peerConnection.createAnswer(); // オファーに対するアンサー（Answer）SDPを生成
    await state.peerConnection.setLocalDescription(answer); // 生成したアンサーを、自身のローカル設定として適用

    await setDoc(callRef, { answer }, { merge: true }); // 生成したアンサーを、Firestoreの通話ドキュメントに書き込む、{ merge: true }オプションにより、既存のオファー情報を消さずにanswerフィールドを追加

    uiElements.callIdDisplay.textContent = callRef.id;
    uiElements.callControls.style.display = "block";

  } catch (error) {
    console.error("Error joining call:", error);
    alert("通話への参加中にエラーが発生しました。Call IDを確認してください。");
    ui.resetUI();
  } finally {
    uiElements.joinCallBtn.disabled = false;
  }
}

/**
 * 送信するビデオトラックに対して帯域（kbps）制限を適用する。
 * RTCRtpSender.getParameters()/setParameters() を用いて encodings[].maxBitrate を設定する。
 * @param {number} kbps - 適用する最大ビットレート（キロビット毎秒）
 */
export async function setVideoBandwidthKbps(kbps) {
  if (!state.peerConnection) {
    throw new Error('PeerConnection が存在しません。通話を開始してから帯域を設定してください。');
  }

  const senders = state.peerConnection.getSenders ? state.peerConnection.getSenders() : [];
  const videoSenders = senders.filter(s => s.track && s.track.kind === 'video');

  if (videoSenders.length === 0) {
    console.warn('ビデオ送信者が見つかりません。');
    return;
  }

  const bps = Number(kbps) * 1000; // kbps -> bps

  for (const sender of videoSenders) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];

      params.encodings = params.encodings.map(enc => ({ ...enc, maxBitrate: bps }));

      await sender.setParameters(params);
      console.log(`setParameters による帯域適用: ${kbps} kbps -> ${bps} bps`, sender, params);
    } catch (err) {
      console.error('送信者に対する setParameters の適用に失敗しました:', err);
    }
  }
}