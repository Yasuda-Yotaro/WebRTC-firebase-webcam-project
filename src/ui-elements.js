// ui-elements.js

export const roleInputs = document.querySelectorAll('input[name="role"]');
export const senderControls = document.getElementById("senderControls");
export const receiverControls = document.getElementById("receiverControls");
export const callControls = document.getElementById("callControls");
export const statsControls = document.getElementById("statsControls");
export const ptzControls = document.getElementById("ptzControls");

export const cameraCountSelect = document.getElementById("cameraCount");
export const cameraSelect1 = document.getElementById("cameraSelect1");
export const cameraSelect2 = document.getElementById("cameraSelect2");
export const cameraSelect2Container = document.getElementById("cameraSelect2Container");
export const resolutionSelect = document.getElementById("resolution");
export const framerateSelect = document.getElementById("framerate");
export const codecSelect = document.getElementById("codecSelect");
export const startCameraBtn = document.getElementById("startCamera");
export const bandwidthKbpsInput = document.getElementById("bandwidthKbpsInput");
export const applyBandwidthBtn = document.getElementById("applyBandwidthBtn");
export const joinCallBtn = document.getElementById("joinCall");
export const hangUpBtn = document.getElementById("hangUpBtn");
export const callIdInput = document.getElementById("callIdInput");
export const callIdDisplay = document.getElementById("callIdDisplay");
export const copyCallIdBtn = document.getElementById("copyCallId");

export const localVideo1 = document.getElementById("localVideo1");
export const localVideo2 = document.getElementById("localVideo2");
export const remoteVideo1 = document.getElementById("remoteVideo1");
export const remoteVideo2 = document.getElementById("remoteVideo2");
export const remoteVideoContainer1 = document.getElementById("remoteVideoContainer1");
export const remoteVideoContainer2 = document.getElementById("remoteVideoContainer2");
export const resolutionDisplay1 = document.getElementById("resolutionDisplay1");
export const resolutionDisplay2 = document.getElementById("resolutionDisplay2");
export const fullscreenBtn1 = document.getElementById("fullscreenBtn1");
export const fullscreenBtn2 = document.getElementById("fullscreenBtn2");


// Stats-related elements
export const startStatsRecordingBtn = document.getElementById("startStatsRecording");
export const stopStatsRecordingBtn = document.getElementById("stopStatsRecording");
export const downloadStatsBtn = document.getElementById("downloadStats");
export const statsDisplay = document.getElementById("statsDisplay");

// PTZ-related elements
export const zoomInBtn = document.getElementById("zoomInBtn");
export const zoomOutBtn = document.getElementById("zoomOutBtn");
export const zoomSlider = document.getElementById("zoomSlider");
export const zoomValue = document.getElementById("zoomValue");
export const tiltUpBtn = document.getElementById("tiltUpBtn");
export const tiltDownBtn = document.getElementById("tiltDownBtn");
export const tiltSlider = document.getElementById("tiltSlider");
export const tiltValue = document.getElementById("tiltValue");
export const panLeftBtn = document.getElementById("panLeftBtn");
export const panRightBtn = document.getElementById("panRightBtn");
export const panSlider = document.getElementById("panSlider");
export const panValue = document.getElementById("panValue");
export const ptzResetBtn = document.getElementById("ptzResetBtn");
export const ptzTargetInputs = document.querySelectorAll('input[name="ptzTarget"]');
export const ptzTargetCamera2Label = document.getElementById("ptzTargetCamera2Label");

// Recording-related elements for Camera 1
export const startRecordingBtn1 = document.getElementById("startRecording1");
export const stopRecordingBtn1 = document.getElementById("stopRecording1");
export const downloadVideoBtn1 = document.getElementById("downloadVideo1");
export const recordingStatus1 = document.getElementById("recordingStatus1");

// Recording-related elements for Camera 2
export const startRecordingBtn2 = document.getElementById("startRecording2");
export const stopRecordingBtn2 = document.getElementById("stopRecording2");
export const downloadVideoBtn2 = document.getElementById("downloadVideo2");
export const recordingStatus2 = document.getElementById("recordingStatus2");

// ArUco Tracking elements
export const arucoControls = document.getElementById("arucoControls");
export const arucoTargetSelect = document.getElementById("arucoTargetSelect");
export const startArucoTrackingBtn = document.getElementById("startArucoTrackingBtn");
export const stopArucoTrackingBtn = document.getElementById("stopArucoTrackingBtn");
export const arucoTrackingStatus = document.getElementById("arucoTrackingStatus");

// IMU control elements
export const enableImuCheckbox = document.getElementById('enableImuCheckbox');
export const connectImuBtn = document.getElementById('connectImuBtn');
export const disconnectImuBtn = document.getElementById('disconnectImuBtn');
export const calibrateImuBtn = document.getElementById('calibrateImuBtn');
