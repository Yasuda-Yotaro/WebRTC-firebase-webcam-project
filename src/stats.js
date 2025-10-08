// stats.js

import * as state from './state.js';
import * as uiElements from './ui-elements.js';

/**
 * 定期的に受信映像の解像度を取得して表示を更新する。
 */
export async function updateResolutionDisplay() {
  if (!state.peerConnection || state.currentRole !== 'receiver' || state.peerConnection.connectionState !== 'connected') {
       return;
  }

  try {
      const stats = await state.peerConnection.getStats();

      // まず、すべての解像度表示を一旦非表示にする
      if (state.remoteTracks) {
          Object.values(state.remoteTracks).forEach(trackInfo => {
              if (trackInfo && trackInfo.displayElement) {
                trackInfo.displayElement.style.display = 'none';
              }
          });
      }

      stats.forEach(report => {
          // 受信中のビデオストリームに関するレポートをフィルタリング
          if (report.type === 'inbound-rtp' && report.mediaType === 'video' && state.remoteTracks) {
              const trackInfo = state.remoteTracks[report.trackIdentifier];

              // 対応するUI要素があり、解像度の情報があれば表示を更新
              if (trackInfo && trackInfo.displayElement && report.frameWidth && report.frameHeight) {
                  trackInfo.displayElement.textContent = `${report.frameWidth} x ${report.frameHeight}`;
                  trackInfo.displayElement.style.display = 'block';
              }
          }
      });

  } catch (error) {
      console.error("Error getting stats for resolution display:", error);
  }
}

/**
 * 送信者側の統計情報を収集する。
 * @param {RTCStatsReport} stats - getStats()から取得したレポート
 * @param {object} dataToRecord - 記録するデータを格納するオブジェクト
 */
function populateSenderStats(stats, dataToRecord) {
  const camera1TrackId = state.videoTracks.camera1?.id; // stateからカメラ1の映像トラックIDを取得
  const camera2TrackId = state.videoTracks.camera2?.id; // stateからカメラ2の映像トラックIDを取得

  // 'media-source'レポートのIDと、それがどの映像トラック（trackIdentifier）に対応するかを紐づけるためのMap（高機能な連想配列）を作成
  const sourceToTrackIdentifierMap = new Map();
  stats.forEach(report => {
    if (report.type === 'media-source') {
      sourceToTrackIdentifierMap.set(report.id, report.trackIdentifier); // Mapに、キーとしてレポートのID（例: 'RTCMediaSource_1'）、値としてトラックID（例: 'abcdef-1234'）を保存
    }
  });

  stats.forEach(report => {
    if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
      // 先ほど作成したMapを使い、この送信ストリームの元（mediaSourceId）に対応するトラックIDを取得
      const trackIdentifier = sourceToTrackIdentifierMap.get(report.mediaSourceId);
      if (!trackIdentifier) {
        return;
      }

      let cameraName;
      if (trackIdentifier === camera1TrackId) {
        cameraName = 'camera1';
      } else if (trackIdentifier === camera2TrackId) {
        cameraName = 'camera2';
      }

      // cameraNameが設定された（つまり、カメラ1か2のどちらかの統計だと判明した）場合のみ、以下の処理を実行
      if (cameraName) {
        const lastOutboundReport = state.lastStatsReport?.get(report.id); // 前回取得した同じレポートを参照(差分を計算するため)
        const bytesSent = report.bytesSent - (lastOutboundReport?.bytesSent ?? 0); // 今回の総送信バイト数から、前回の総送信バイト数を引いて、この1秒間の送信バイト数を計算
        const packetsSent = report.packetsSent - (lastOutboundReport?.packetsSent ?? 0); // 同様に、送信パケット数の差分を計算

        // 収集したデータをdataToRecordオブジェクトに格納、キー名にcameraNameを付与して区別
        dataToRecord[`${cameraName}_sent_resolution`] = `${report.frameWidth}x${report.frameHeight}`; // 送信解像度
        dataToRecord[`${cameraName}_sent_fps`] = report.framesPerSecond; // 送信フレームレート
        dataToRecord[`${cameraName}_sent_bitrate_kbps`] = Math.round((Math.max(0, bytesSent) * 8) / 1000); // 送信ビットレート(kbps)
        dataToRecord[`${cameraName}_packets_sent_per_second`] = Math.max(0, packetsSent); // 送信パケット数/秒
        dataToRecord[`${cameraName}_total_encode_time_s`] = report.totalEncodeTime; // 総エンコード時間(秒)
        dataToRecord[`${cameraName}_keyframes_encoded`] = report.keyFramesEncoded; // キーフレーム数
        dataToRecord[`${cameraName}_quality_limitation_reason`] = report.qualityLimitationReason; // 品質制限の理由
        dataToRecord[`${cameraName}_quality_limitation_resolution_changes`] = report.qualityLimitationResolutionChanges; // 品質制限による解像度変更回数
        dataToRecord[`${cameraName}_retransmitted_packets_sent`] = report.retransmittedPacketsSent; // 再送パケット数
        dataToRecord[`${cameraName}_nack_count`] = report.nackCount; // NACK数
      }
    }
    if (report.type === 'remote-inbound-rtp' && report.mediaType === 'video') {
      dataToRecord.receiver_jitter_ms = (report.jitter * 1000)?.toFixed(4) ?? 'N/A'; // ジッター(ミリ秒)
      dataToRecord.receiver_packets_lost = report.packetsLost; // パケットロス数
      dataToRecord.receiver_fraction_lost = report.fractionLost; // パケットロス率
      dataToRecord.rtt_rtcp_ms = (report.roundTripTime * 1000)?.toFixed(4) ?? 'N/A'; // RTT(ミリ秒)
    }
    if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
      dataToRecord.available_outgoing_bitrate_kbps = report.availableOutgoingBitrate ? Math.round(report.availableOutgoingBitrate / 1000) : 'N/A'; // 利用可能な送信ビットレート(kbps)
      dataToRecord.rtt_ice_ms = (report.currentRoundTripTime * 1000)?.toFixed(4) ?? 'N/A'; // ICE RTT(ミリ秒)
      const remoteCandidate = stats.get(report.remoteCandidateId);
      if (remoteCandidate && remoteCandidate.candidateType) {
        let connectionTypeValue;
        switch (remoteCandidate.candidateType) {
          case 'host':
            connectionTypeValue = 0; // ローカル接続
            break;
          case 'srflx': // STUNサーバー経由で見つかった候補
          case 'prflx': // STUNサーバー経由で見つかったピアの候補
            connectionTypeValue = 1; // STUN経由
            break;
          case 'relay':
            connectionTypeValue = 2; // TURNサーバー経由
            break;
          default:
            connectionTypeValue = -1; // 不明なタイプ
            break;
        }
        dataToRecord.connection_type = connectionTypeValue;  // 接続タイプを数値で保存
      }
    }
    // ----- ▼ データチャネル統計情報の収集を修正 ▼ -----
    if (report.type === 'data-channel') {
      const lastDataChannelReport = state.lastStatsReport?.get(report.id);
      const bytesSent = report.bytesSent - (lastDataChannelReport?.bytesSent ?? 0);
      const bytesReceived = report.bytesReceived - (lastDataChannelReport?.bytesReceived ?? 0);

      dataToRecord[`datachannel_${report.label}_state`] = report.state;
      dataToRecord[`datachannel_${report.label}_messages_sent`] = report.messagesSent;
      dataToRecord[`datachannel_${report.label}_bytes_sent_total`] = report.bytesSent; // 総送信バイト数を別名で記録
      dataToRecord[`datachannel_${report.label}_messages_received`] = report.messagesReceived;
      dataToRecord[`datachannel_${report.label}_bytes_received_total`] = report.bytesReceived; // 総受信バイト数を別名で記録
      dataToRecord[`datachannel_${report.label}_sent_bitrate_kbps`] = Math.round((Math.max(0, bytesSent) * 8) / 1000); // 1秒ごとの送信ビットレート
      dataToRecord[`datachannel_${report.label}_received_bitrate_kbps`] = Math.round((Math.max(0, bytesReceived) * 8) / 1000); // 1秒ごとの受信ビットレート
    }
    // ----- ▲ データチャネル統計情報の収集を修正 ▲ -----
  });
}


/**
 * 受信者側の統計情報を収集する。
 * @param {RTCStatsReport} stats - getStats()から取得したレポート
 * @param {object} dataToRecord - 記録するデータを格納するオブジェクト
 */
function populateReceiverStats(stats, dataToRecord) {
  stats.forEach(report => {
    if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
      const trackInfo = state.remoteTracks[report.trackIdentifier]; // stateからこのトラックIDに対応するカメラ情報を取得
      const cameraName = trackInfo ? trackInfo.name : null; // カメラ名（'camera1'または'camera2'）を取得

      if (cameraName) {
        const lastInboundReport = state.lastStatsReport?.get(report.id);
        const bytesReceived = report.bytesReceived - (lastInboundReport?.bytesReceived ?? 0);
        const packetsReceived = report.packetsReceived - (lastInboundReport?.packetsReceived ?? 0);

        dataToRecord[`${cameraName}_received_resolution`] = `${report.frameWidth}x${report.frameHeight}`; // 受信解像度
        dataToRecord[`${cameraName}_received_fps`] = report.framesPerSecond; // 受信フレームレート
        dataToRecord[`${cameraName}_received_bitrate_kbps`] = Math.round((Math.max(0, bytesReceived) * 8) / 1000); // 受信ビットレート(kbps)
        dataToRecord[`${cameraName}_packets_received_per_second`] = Math.max(0, packetsReceived); // 受信パケット数/秒
        dataToRecord[`${cameraName}_jitter_ms`] = (report.jitter * 1000)?.toFixed(4) ?? 'N/A'; // ジッター(ミリ秒)
        dataToRecord[`${cameraName}_fraction_lost`] = report.fractionLost; // パケットロス率
        dataToRecord[`${cameraName}_packets_lost`] = report.packetsLost; // パケットロス数
        dataToRecord[`${cameraName}_frames_dropped`] = report.framesDropped; // ドロップされたフレーム数
        dataToRecord[`${cameraName}_total_decode_time_s`] = report.totalDecodeTime; // 総デコード時間(秒)
        dataToRecord[`${cameraName}_keyframes_decoded`] = report.keyFramesDecoded; // キーフレーム数
        dataToRecord[`${cameraName}_jitter_buffer_delay_s`] = report.jitterBufferDelay; // ジッターバッファ遅延(秒)
        dataToRecord[`${cameraName}_fir_count`] = report.firCount; // FIR数
        dataToRecord[`${cameraName}_pli_count`] = report.pliCount; // PLI数
        dataToRecord[`${cameraName}_jitter_buffer_emitted_count`] = report.jitterBufferEmittedCount; // ジッターバッファから出力されたフレーム数
      }
    }
    if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
      const remoteCandidate = stats.get(report.remoteCandidateId);
      if (remoteCandidate && remoteCandidate.candidateType) {
        dataToRecord.connection_type = remoteCandidate.candidateType;
      }
    }
    // ----- ▼ データチャネル統計情報の収集を修正 ▼ -----
    if (report.type === 'data-channel') {
        const lastDataChannelReport = state.lastStatsReport?.get(report.id);
        const bytesSent = report.bytesSent - (lastDataChannelReport?.bytesSent ?? 0);
        const bytesReceived = report.bytesReceived - (lastDataChannelReport?.bytesReceived ?? 0);
  
        dataToRecord[`datachannel_${report.label}_state`] = report.state;
        dataToRecord[`datachannel_${report.label}_messages_sent`] = report.messagesSent;
        dataToRecord[`datachannel_${report.label}_bytes_sent_total`] = report.bytesSent; // 総送信バイト数を別名で記録
        dataToRecord[`datachannel_${report.label}_messages_received`] = report.messagesReceived;
        dataToRecord[`datachannel_${report.label}_bytes_received_total`] = report.bytesReceived; // 総受信バイト数を別名で記録
        dataToRecord[`datachannel_${report.label}_sent_bitrate_kbps`] = Math.round((Math.max(0, bytesSent) * 8) / 1000); // 1秒ごとの送信ビットレート
        dataToRecord[`datachannel_${report.label}_received_bitrate_kbps`] = Math.round((Math.max(0, bytesReceived) * 8) / 1000); // 1秒ごとの受信ビットレート
      }
    // ----- ▲ データチャネル統計情報の収集を修正 ▲ -----
  });
}


/**
 * 統計情報の記録を開始する。
 */
export function startStatsRecording() {
  if (!state.peerConnection || state.isRecordingStats) return;

  state.setIsRecordingStats(true); // state管理ファイル(state.js)を更新し、「記録中である」という状態(true)に設定
  state.setRecordedStats([]); // 以前の記録データが残っている可能性があるので、記録データを保存する配列を空にリセット
  state.setLastStatsReport(null); // 1秒間の差分を計算するために使う「最後の統計レポート」をnullにリセット

  uiElements.startStatsRecordingBtn.disabled = true;
  uiElements.stopStatsRecordingBtn.disabled = false;
  uiElements.downloadStatsBtn.disabled = true;
  uiElements.statsDisplay.textContent = "記録中...";

  // 1秒ごとに統計情報を取得して記録するためのタイマーをセット
  const interval = setInterval(async () => {
    if (!state.peerConnection) return;

    const stats = await state.peerConnection.getStats(); // 現在のWebRTC統計情報を非同期で取得
    const dataToRecord = { timestamp: new Date().toISOString() }; // この瞬間に記録するデータを格納するためのオブジェクトを作成し、まず現在時刻のタイムスタンプを追加

    if (state.currentRole === "sender") {
      populateSenderStats(stats, dataToRecord); // 送信側に関連する統計情報を抽出・整形して dataToRecord に追加する関数を呼び出す
    } else {
      populateReceiverStats(stats, dataToRecord); // 受信側に関連する統計情報を抽出・整形して dataToRecord に追加する関数を呼び出す
    }

    // タイムスタンプ以外に何かしらのデータが記録された場合のみ追加
    if (Object.keys(dataToRecord).length > 1) {
      state.recordedStats.push(dataToRecord); // 統計データが存在する場合のみ、state の recordedStats 配列にそのデータを追加
      uiElements.statsDisplay.textContent = `記録中... ${state.recordedStats.length} 個`;
    }
    state.setLastStatsReport(stats); // 今回取得した統計情報全体を「最後の統計レポート」としてstateに保存
  }, 1000);
  state.setStatsInterval(interval); // 設定したタイマーのIDをstateに保存、これにより、後で「記録停止」ボタンが押されたときにタイマーを停止
}

/**
 * 統計情報の記録を停止する。
 */
export function stopStatsRecording() {
  if (!state.isRecordingStats) return;

  clearInterval(state.statsInterval); // 1秒ごとに統計情報を取得していたタイマーを停止
  state.setIsRecordingStats(false); //
  state.setLastStatsReport(null);

  uiElements.startStatsRecordingBtn.disabled = false;
  uiElements.stopStatsRecordingBtn.disabled = true;
  uiElements.downloadStatsBtn.disabled = state.recordedStats.length === 0;
  uiElements.statsDisplay.textContent = `記録停止。${state.recordedStats.length} 個`;
}

/**
 * 記録した統計情報をCSVファイルとしてダウンロードする。
 */
export function downloadStatsAsCsv() {
  // ダウンロードするデータがない場合は処理を中止
  if (state.recordedStats.length === 0) {
    alert("ダウンロードするデータがありません");
    return;
  }

  // CSVのヘッダー（1行目の項目名）を重複なく収集するために `Set` というデータ構造を準備
  const headerSet = new Set();
  // 収集したすべての統計情報（recordedStats）を1行ずつ（row）取り出してループ処理
  state.recordedStats.forEach(row => Object.keys(row).forEach(key => headerSet.add(key))); // 取り出したキー（'packetsLost', 'jitter'など）をheaderSetに追加
  const headers = Array.from(headerSet); // Setから通常の配列（Array）に変換、これによりヘッダーの順序が固定

  // CSVの各行を文字列として格納するための配列 `csvRows` を準備
  const csvRows = [
    headers.join(','), // 1行目：ヘッダー行を作成、headers配列の各項目をカンマ(,)で連結した文字列
    ...state.recordedStats.map(row =>
      headers.map(header => {
        const value = row[header] ?? '';
        return typeof value === 'string' && value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value;
      }).join(',')
    )
  ];

  const csvString = csvRows.join('\n'); // csvRows配列（ヘッダー行＋データ行）の各行を、改行文字(\n)で連結して、最終的なCSV全体の文字列を作成
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' }); // 作成したCSV文字列から、Blobオブジェクトを作成
  const url = URL.createObjectURL(blob); // 作成したBlobにアクセスするための、一時的なURLを生成

  const link = document.createElement('a'); // ダウンロードをトリガーするための、非表示の`<a>`（リンク）要素を作成
  link.href = url; // リンクの飛び先として、先ほど作成した一時URLを設定
  link.download = `webrtc_stats_${state.currentRole}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`; // download属性にファイル名を設定することで、リンククリック時にナビゲートする代わりにダウンロードを実行
  document.body.appendChild(link); // / 作成したリンクをページに追加（画面上には見えない）
  link.click(); // プログラムでリンクをクリックして、ダウンロードを実行
  document.body.removeChild(link); // ダウンロードが始まったら、不要になったリンクをページから削除
  URL.revokeObjectURL(url); // 作成した一時URLを解放して、メモリを節約
}