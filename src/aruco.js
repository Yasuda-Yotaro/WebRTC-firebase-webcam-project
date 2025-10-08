// src/aruco.js

import * as ptz from './ptz.js';
import * as state from './state.js';
import * as uiElements from './ui-elements.js';
import * as evaluation from './evaluation.js'; 

// 処理解像度の幅（高さはアスペクト比を維持して自動計算）
// 解像度を低くすることで、処理負荷を軽減し、パフォーマンスを向上させる目的
const PROCESSING_RESOLUTION_WIDTH = 320;

// 何フレームごとにマーカー検出処理を行うかの間隔
// 毎フレーム処理すると負荷が高すぎるため、間引いて処理を行う
const FRAME_PROCESSING_INTERVAL = 4;

// 評価データを何回の検出ごとに記録するかの間隔。
const LOG_INTERVAL = 5; 

let videoElement; // 処理対象となるHTMLの<video>要素を格納する
let canvasOutput; // 検出結果（マーカーの枠線など）をビデオ映像の上に重ねて描画するためのHTMLの<canvas>要素を格納する変数
let processCanvas; // マーカー検出処理のために、ビデオ映像を縮小して描画するための内部的な<canvas>要素
let processCtx; // processCanvasの2D描画コンテキスト
let trackingActive = false; // 追跡処理がアクティブかどうかを示すフラグ
let animationFrameId; // requestAnimationFrameのIDを格納する変数
let targetCameraName; // 'camera1'または'camera2'を格納する変数

// ゲイン設定
const PID_GAINS = {
    pan:  { Kp: 84000, Ki: 0, Kd: 0 },
    tilt: { Kp: -85000, Ki: 0, Kd: 0}
};
// パン（左右）とチルト（上下）それぞれのPID制御の状態を保持するオブジェクト
// integral（積分値）とpreviousError（前回の誤差）を記録する
let panState = { integral: 0, previousError: 0 };
let tiltState = { integral: 0, previousError: 0 };
let lastTime = 0; // 前回のフレーム処理時刻を保持する変数

let frameCounter = 0; // フレーム処理用のカウンター
let logCounter = 0; // 評価ログ用のカウンター

/*
   OpenCV.jsのMatオブジェクトとArucoDetectorオブジェクト
   detector: ArUcoマーカーの検出器
   src: 入力画像を格納するMat
   gray: グレースケール変換後の画像を格納するMat
   rgb: RGB画像を格納するMat（必要に応じて使用）
   corners: 検出されたマーカーのコーナー座標を格納するMatVector
   ids: 検出されたマーカーのIDを格納するMat 
*/
let detector, src, gray, rgb, corners, ids;

// OpenCV.jsの初期化完了を待つPromise
const openCvReadyPromise = new Promise(resolve => {
  const checkCv = () => {
    // グローバルスコープに 'cv' オブジェクトが存在するか確認
    if (typeof cv !== 'undefined') {
      // 存在すれば、初期化完了時のコールバックを設定
      console.log("OpenCV.jsのオブジェクト 'cv' を確認しました。ランタイムの初期化を待ちます。");
      cv.onRuntimeInitialized = () => {
        console.log("OpenCV.jsのランタイムが初期化されました。");
        // ここでOpenCVに依存する変数を安全に初期化
        const dictionary = cv.getPredefinedDictionary(cv.DICT_4X4_50); 
        const parameters = new cv.aruco_DetectorParameters();
        const refineParameters = new cv.aruco_RefineParameters(10, 3, true);
        detector = new cv.aruco_ArucoDetector(dictionary, parameters, refineParameters);
        
        src = new cv.Mat();
        gray = new cv.Mat();
        rgb = new cv.Mat();
        corners = new cv.MatVector();
        ids = new cv.Mat();
        
        // Promiseを解決して、処理の準備ができたことを通知
        resolve();
      };
    } else {
      // 'cv' がまだ存在しない場合、少し待ってから再チェック
      console.log("OpenCV.jsの 'cv' オブジェクトを待機中...");
      setTimeout(checkCv, 100); // 100ミリ秒後に再試行
    }
  };
  // 最初のチェックを開始
  checkCv();
});

// ArUco追跡を開始する関数
export async function start(target) {
    if (trackingActive) return; // すでに追跡中なら何もしない
    
    targetCameraName = target; // 引数で受け取ったカメラ名をグローバル変数に保存
    videoElement = target === 'camera1' ? uiElements.localVideo1 : uiElements.localVideo2; // 対象の<video>要素を設定

    if (!videoElement || !videoElement.srcObject || videoElement.readyState < 3) {
        alert("対象のビデオストリームが準備できていません。");
        return;
    }
    
    uiElements.arucoTrackingStatus.textContent = "OpenCVを初期化中";
    await openCvReadyPromise; // OpenCV.jsの初期化を待つ
    uiElements.arucoTrackingStatus.textContent = "追跡を開始します";
    
    trackingActive = true; // 追跡中フラグをtrueに設定

    // PID制御の状態をリセット
    panState = { integral: 0, previousError: 0 };
    tiltState = { integral: 0, previousError: 0 };
    lastTime = performance.now();
    frameCounter = 0; // カウンターをリセット
    logCounter = 0;
    
    canvasOutput = document.createElement('canvas'); // オーバーレイ用のキャンバスを作成
    videoElement.parentElement.appendChild(canvasOutput); // ビデオの親要素に追加
    canvasOutput.style.position = 'absolute'; // ビデオの上に重ねて表示
    canvasOutput.style.pointerEvents = 'none'; // クリックを透過させる

    processCanvas = document.createElement('canvas'); // 処理用の内部キャンバスを作成
    processCtx = processCanvas.getContext('2d', { willReadFrequently: true }); // 頻繁に読み取るためのオプションを指定  
    
    processVideo(); // メインの処理ループを開始
}

// メインの処理ループ
function processVideo() {
    if (!trackingActive) {
        animationFrameId = requestAnimationFrame(processVideo);
        return;
    }

    try {
        // 指定した間隔のフレームでない場合は、処理をスキップ
        frameCounter++;
        if (frameCounter % FRAME_PROCESSING_INTERVAL !== 0) {
            animationFrameId = requestAnimationFrame(processVideo);
            return;
        }
        // ビデオの元の解像度を取得
        const originalWidth = videoElement.videoWidth;
        const originalHeight = videoElement.videoHeight;
        if (originalWidth === 0 || originalHeight === 0) {
            animationFrameId = requestAnimationFrame(processVideo);
            return;
        }

        // 処理解像度を計算
        const scale = PROCESSING_RESOLUTION_WIDTH / originalWidth;
        const processWidth = PROCESSING_RESOLUTION_WIDTH;
        const processHeight = Math.round(originalHeight * scale);

        // 処理用キャンバスのサイズを設定
        if (processCanvas.width !== processWidth || processCanvas.height !== processHeight) {
            processCanvas.width = processWidth;
            processCanvas.height = processHeight;
        }
        
        // オーバーレイ用キャンバスのサイズは元のビデオ表示サイズに合わせる
        if (canvasOutput.width !== originalWidth || canvasOutput.height !== originalHeight) {
             canvasOutput.width = originalWidth;
             canvasOutput.height = originalHeight;
             canvasOutput.style.width = videoElement.clientWidth + 'px';
             canvasOutput.style.height = videoElement.clientHeight + 'px';
             canvasOutput.style.top = videoElement.offsetTop + 'px';
             canvasOutput.style.left = videoElement.offsetLeft + 'px';
        }

        // ビデオフレームを"縮小して"内部キャンバスに描画
        processCtx.drawImage(videoElement, 0, 0, processWidth, processHeight);

        // Matオブジェクトのサイズも処理用に合わせる
        if (src.cols !== processWidth || src.rows !== processHeight) {
            if (!src.isDeleted()) src.delete();
            if (!gray.isDeleted()) gray.delete();
            if (!rgb.isDeleted()) rgb.delete();

            src = new cv.Mat(processHeight, processWidth, cv.CV_8UC4);
            gray = new cv.Mat(processHeight, processWidth, cv.CV_8UC1);
            rgb = new cv.Mat(processHeight, processWidth, cv.CV_8UC3);
        }

        const imageData = processCtx.getImageData(0, 0, processWidth, processHeight); // 内部キャンバスから画像データを取得
        src.data.set(imageData.data); // Matに画像データをセット

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); // グレースケール変換
        detector.detectMarkers(gray, corners, ids); // マーカー検出
        
        // 評価ログを記録するかどうかの判定
        logCounter++;
        const shouldLog = logCounter % LOG_INTERVAL === 0; // 指定した間隔でログを記録

        const outputCtx = canvasOutput.getContext('2d'); //
        outputCtx.clearRect(0, 0, canvasOutput.width, canvasOutput.height); // 描画前にクリア

        if (ids.rows > 0) {
            // PTZ制御と評価データ計算
            const evalData = calculateAndApplyConstraint(corners.get(0), processWidth, processHeight);
            if (shouldLog) {
                evaluation.logData('aruco', { detected: 1, ...evalData });
            }

            // マーカーの枠を描画する
            const cornerPoints = corners.get(0).data32F;
            outputCtx.strokeStyle = 'red';
            outputCtx.lineWidth = 3;
            outputCtx.beginPath();

            // 座標を元の解像度スケールに戻して描画
            outputCtx.moveTo(cornerPoints[0] / scale, cornerPoints[1] / scale);
            for (let i = 2; i < cornerPoints.length; i += 2) {
                outputCtx.lineTo(cornerPoints[i] / scale, cornerPoints[i+1] / scale);
            }
            outputCtx.closePath();
            outputCtx.stroke();

        } else {
            if (shouldLog) {
                evaluation.logData('aruco', { 
                    detected: 0, markerX: null, markerY: null, errorX: null, errorY: null, 
                    panAdjustment: null, tiltAdjustment: null 
                });
            }
        }

    } catch (error) {
        console.error("ArUco追跡中にエラー:", error);
        uiElements.arucoTrackingStatus.textContent = "エラーが発生しました";
        stop();
    }

    animationFrameId = requestAnimationFrame(processVideo);
}

// PTZ制御の計算と適用
function calculateAndApplyConstraint(markerCorners, frameWidth, frameHeight) {
    // 現在時刻を取得し、前回からの経過時間 dt (delta time) を秒単位で計算
    const now = performance.now();
    const dt = (now - lastTime) / 1000.0;
    lastTime = now;
    
    // マーカーの4つの頂点座標の平均を計算して、マーカーの中心座標 (centerX, centerY) を求める
    let centerX = 0;
    let centerY = 0;
    for (let i = 0; i < 4; ++i) {
        centerX += markerCorners.data32F[i * 2];
        centerY += markerCorners.data32F[i * 2 + 1];
    }
    centerX /= 4;
    centerY /= 4;

    // 画面中央 (frameWidth / 2, frameHeight / 2) とマーカー中心の差を計算し、それをフレーム幅/高さで割って正規化（-0.5から+0.5の範囲に）する
    const errorX = (centerX - frameWidth / 2) / frameWidth;
    const errorY = (centerY - frameHeight / 2) / frameHeight;

    uiElements.arucoTrackingStatus.textContent = `マーカー検出: (x: ${Math.round(centerX)}, y: ${Math.round(centerY)})`;

    // stateモジュールから現在のカメラのMediaStreamTrackを取得し、その設定（settings）と能力（capabilities、例えばパンの最大・最小値など）を取得する
    const track = state.videoTracks[targetCameraName];
    if (!track) return null;

    const settings = track.getSettings();
    const capabilities = track.getCapabilities();
    
    let panAdjustment = 0;
    let tiltAdjustment = 0;
    // パン操作量の決定と適用
    if (settings.pan !== undefined && capabilities.pan) {
        panState.integral = Math.max(-1, Math.min(1, panState.integral + errorX * dt)); // Math.max/minで値が-1〜1の範囲に収まるように制限し、積分値が発散しないようにする（アンチワインドアップ）
        const derivative = (errorX - panState.previousError) / dt; // （今回のズレ - 前回のズレ）でズレの変化量を計算し、それを経過時間dtで割って変化の「速度」を算出する
        panState.previousError = errorX;
        panAdjustment = (PID_GAINS.pan.Kp * errorX) + (PID_GAINS.pan.Ki * panState.integral) + (PID_GAINS.pan.Kd * derivative); // // P, I, D を使って最終的な操作量を計算
        const newPan = Math.max(capabilities.pan.min, Math.min(capabilities.pan.max, settings.pan + panAdjustment)); // 計算した操作量を現在のパンの値に加算し、その結果がカメラの可動範囲（minとmax）を超えないように値を丸める
        ptz.applyPtzConstraint(targetCameraName, 'pan', newPan);
    }
    // チルト操作量の決定と適用
    if (settings.tilt !== undefined && capabilities.tilt) {
        tiltState.integral = Math.max(-1, Math.min(1, tiltState.integral + errorY * dt));
        const derivative = (errorY - tiltState.previousError) / dt;
        tiltState.previousError = errorY;
        tiltAdjustment = (PID_GAINS.tilt.Kp * errorY) + (PID_GAINS.tilt.Ki * tiltState.integral) + (PID_GAINS.tilt.Kd * derivative);
        const newTilt = Math.max(capabilities.tilt.min, Math.min(capabilities.tilt.max, settings.tilt + tiltAdjustment));
        ptz.applyPtzConstraint(targetCameraName, 'tilt', newTilt);
    }
    // 評価ログのために、計算に使った各種データをオブジェクトとして返す
    return {
        markerX: centerX, markerY: centerY, errorX, errorY, panAdjustment, tiltAdjustment
    };
}

// 追跡停止処理
export function stop() {
    if (!trackingActive) return;
    trackingActive = false; // 追跡中フラグをfalseに、これによりprocessVideoループ内の処理がスキップされるようになる
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId); // requestAnimationFrameで予約した次のフレームの呼び出しをキャンセルし、ループを完全に停止
        animationFrameId = null;
    }
    if (canvasOutput) {
        const ctx = canvasOutput.getContext('2d');
        ctx.clearRect(0, 0, canvasOutput.width, canvasOutput.height);
        canvasOutput.remove(); // 画面に重ねていた描画用キャンバスをDOMから削除
        canvasOutput = null;
    }
    
    processCanvas = null;
    processCtx = null;
    
    uiElements.arucoTrackingStatus.textContent = "停止しました";
    console.log("ArUco tracking stopped.");
}