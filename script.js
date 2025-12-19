const video = document.getElementById('video');
const loadingOverlay = document.getElementById('loading');
const videoWrapper = document.querySelector('.video-wrapper');
const toggleBtn = document.getElementById('toggle-detection');
const thankYouOverlay = document.getElementById('thank-you-overlay');

// --- STATE MANAGEMENT ---
const logs = [];
const analytics = {};
let lastLogTime = 0;
let isLoopRunning = false;
let isPaused = false;
let frameCount = 0;

// Hysteresis
let lastConfirmedEmotion = 'neutral';
let emotionConsecutiveCount = 0;
const STICKY_THRESHOLD = 6; // Increased for stability

// Audio Cooldowns
let lastSpeechTime = 0;
const SPEECH_COOLDOWN = 3000; // 3s cooldown for beep

// Temporal Smoothing
const historyBuffer = [];
const HISTORY_SIZE = 15; // Increased for accuracy

// EAR History
const earHistory = [];

console.log("AURA AI: Version 5 Loaded");

// --- INITIALIZATION ---
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/Aura/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/Aura/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('/Aura/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/Aura/models'),
  faceapi.nets.ageGenderNet.loadFromUri('/Aura/models')
]).then(initialStart).catch(err => {
  console.error("Error loading models: ", err);
  loadingOverlay.innerHTML = `<p style="color:red">Error loading models.<br>Check console for details.</p>`;
});

function initialStart() {
  // 1. Ensure Overlay is Hidden
  if (thankYouOverlay) {
    thankYouOverlay.classList.add('hidden');
    thankYouOverlay.style.display = 'none';
  }
  // 2. Ensure Button says STOP
  if (toggleBtn) {
    toggleBtn.innerText = "STOP AI";
    toggleBtn.style.background = "rgba(0, 243, 255, 0.1)";
    toggleBtn.style.color = "#00f3ff";
    toggleBtn.style.borderColor = "#00f3ff";
  }
  isPaused = false;
  startCamera();
}

function startCamera() {
  navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
    .then(stream => {
      video.srcObject = stream;
      video.play();
    })
    .catch(err => {
      console.error("Error accessing webcam: ", err);
      loadingOverlay.innerHTML = `<p style="color:red">Camera Error:<br>${err.message}</p>`;
    });
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
}

// Audio State
let isFunMode = false;
const funAudioFiles = [
  'audio/Voicy_Dhai kilo ka hath.mp3',
  'audio/Voicy_Hey Ma Mataji.mp3',
  'audio/Voicy_Padhaai Likhaai me dhyan do.mp3',
  'audio/Voicy_khatam goodbye.mp3'
];
const funAudios = []; // Preloaded audio objects

// Preload Audio
funAudioFiles.forEach(src => {
  const audio = new Audio(src);
  funAudios.push(audio);
});

// Fun Mode Toggle
const funModeToggle = document.getElementById('fun-mode-toggle');
if (funModeToggle) {
  funModeToggle.addEventListener('change', (e) => {
    isFunMode = e.target.checked;
    console.log("Fun Mode:", isFunMode);
  });
}

// --- AUDIO LOGIC (BEEP) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
  oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.1);
}

function handleAudioFeedback(outcome) {
  if (outcome === 'sleepy') {
    const now = Date.now();
    if (now - lastSpeechTime < SPEECH_COOLDOWN) return;
    lastSpeechTime = now;

    if (isFunMode) {
      // Play Random Fun Audio
      const randomAudio = funAudios[Math.floor(Math.random() * funAudios.length)];
      randomAudio.currentTime = 0;
      randomAudio.play().catch(e => console.log("Audio play failed:", e));
    } else {
      // Default Beep
      playBeep();
    }
  }
}

function logData(outcome, age, gender) {
  const now = Date.now();
  if (now - lastLogTime > 2000) {
    lastLogTime = now;
    const timestamp = new Date().toLocaleTimeString();
    logs.push({ timestamp, emotion: outcome, age, gender });
    analytics[outcome] = (analytics[outcome] || 0) + 1;
  }
}

// --- MAIN DETECTION LOOP ---
video.addEventListener('play', () => {
  // Check if canvas exists
  if (videoWrapper.querySelector('canvas')) return;

  // Wait for dimensions logic handled inside loop for robustness
  // But check here too to avoid initial errors
  if (video.readyState < 2 || video.videoWidth === 0) {
    setTimeout(() => video.dispatchEvent(new Event('play')), 100);
    return;
  }

  const canvas = faceapi.createCanvasFromMedia(video);
  videoWrapper.append(canvas);

  // Set initial size
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  loadingOverlay.classList.add('hidden');

  let isDetecting = false;

  async function detect() {
    if (video.paused || video.ended || isPaused) {
      if (isPaused) isLoopRunning = false;
      return;
    }

    // --- SAFETY CHECKS ---
    if (video.readyState < 2 || video.videoWidth < 1 || video.videoHeight < 1) {
      requestAnimationFrame(detect);
      return;
    }

    // Dynamic Resizing
    const currentSize = { width: video.videoWidth, height: video.videoHeight };
    if (canvas.width !== currentSize.width || canvas.height !== currentSize.height) {
      faceapi.matchDimensions(canvas, currentSize);
    }

    requestAnimationFrame(detect);

    if (isDetecting) return;
    isDetecting = true;

    // Frame Skipping
    frameCount++;
    if (frameCount % 2 !== 0) {
      isDetecting = false;
      return;
    }

    try {
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
      const detections = await faceapi.detectAllFaces(video, options)
        .withFaceLandmarks()
        .withFaceExpressions()
        .withAgeAndGender();

      // CRITICAL CHECK
      if (currentSize.width === 0 || currentSize.width === 0) {
        isDetecting = false;
        return;
      }

      const resizedDetections = faceapi.resizeResults(detections, currentSize);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      resizedDetections.forEach(detection => {
        const box = detection.detection.box;
        const landmarks = detection.landmarks;

        // 1. EAR Logic
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        function getEAR(eye) {
          const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
          const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
          const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
          return (v1 + v2) / (2.0 * h);
        }
        const avgEAR = (getEAR(leftEye) + getEAR(rightEye)) / 2;
        const eyesHalfClosed = avgEAR < 0.23;

        // Flinching
        earHistory.push(avgEAR);
        if (earHistory.length > 20) earHistory.shift();
        const earMean = earHistory.reduce((a, b) => a + b, 0) / earHistory.length;
        const earVariance = earHistory.reduce((a, b) => a + Math.pow(b - earMean, 2), 0) / earHistory.length;
        const isFlinching = earVariance > 0.005;

        // Tilt
        const pLeft = landmarks.positions[36];
        const pRight = landmarks.positions[45];
        const dy = pRight.y - pLeft.y;
        const dx = pRight.x - pLeft.x;
        const angleDeg = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
        const isHeadResting = angleDeg > 20;

        const isSleepy = eyesHalfClosed || isHeadResting || (eyesHalfClosed && isFlinching);

        // 2. Sadness (Refined)
        const mouLeft = landmarks.positions[48];
        const mouRight = landmarks.positions[54];
        const mouCenter = landmarks.positions[62];
        // Frown calculation: corners slightly lower than center (More sensitive: +2)
        const isFrowning = (mouLeft.y > mouCenter.y + 2) && (mouRight.y > mouCenter.y + 2);

        // 3. Smoothing
        if (detection.expressions) {
          historyBuffer.push(detection.expressions);
          if (historyBuffer.length > HISTORY_SIZE) historyBuffer.shift();
        }

        const averagedExpressions = {};
        const emotionKeys = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
        if (historyBuffer.length > 0) {
          emotionKeys.forEach(k => averagedExpressions[k] = 0);
          for (const expr of historyBuffer) {
            emotionKeys.forEach(k => { if (typeof expr[k] === 'number') averagedExpressions[k] += expr[k]; });
          }
          emotionKeys.forEach(k => averagedExpressions[k] /= historyBuffer.length);
        }

        if (isFrowning) averagedExpressions['sad'] += 0.35; // Boost score if frowning
        if (isHeadResting) averagedExpressions['neutral'] -= 0.2;

        // Decision
        const expressions = averagedExpressions;
        let rawWinner = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);

        // Tuning: Force Sad if it's significant but Neutral is winning
        if (expressions['sad'] > 0.35 && rawWinner === 'neutral') {
          rawWinner = 'sad';
        }

        let score = Math.round(expressions[rawWinner] * 100);

        if (isSleepy) {
          rawWinner = "sleepy";
          score = 85 + Math.round(Math.random() * 15);
          if (isHeadResting) score = 99;
        }

        // Hysteresis
        if (rawWinner === lastConfirmedEmotion) {
          emotionConsecutiveCount++;
        } else {
          emotionConsecutiveCount = 0;
          if (rawWinner === 'sleepy' || lastConfirmedEmotion === 'sleepy') {
            lastConfirmedEmotion = rawWinner;
          } else {
            lastConfirmedEmotion = rawWinner;
          }
        }
        let outcome = lastConfirmedEmotion;
        if (rawWinner === 'sleepy') outcome = 'sleepy';

        handleAudioFeedback(outcome);
        logData(outcome, Math.round(detection.age), detection.gender);

        // Draw Text / UI
        const mirroredX = canvas.width - box.x - box.width;
        ctx.strokeStyle = isSleepy ? '#ff0055' : '#00f3ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(mirroredX, box.y, box.width, box.height);

        let cardX = mirroredX + box.width + 10;
        const cardY = box.y;
        if (cardX + 160 > canvas.width) cardX = mirroredX - 170;

        ctx.fillStyle = isSleepy ? 'rgba(50, 0, 0, 0.85)' : 'rgba(15, 12, 41, 0.85)';
        ctx.fillRect(cardX, cardY, 160, 110);
        ctx.strokeStyle = isSleepy ? '#ff0055' : 'rgba(0, 243, 255, 0.5)';
        ctx.strokeRect(cardX, cardY, 160, 110);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Outfit", sans-serif';
        ctx.fillText(`${outcome.charAt(0).toUpperCase() + outcome.slice(1)}`, cardX + 15, cardY + 30);

        ctx.fillStyle = isSleepy ? '#ffaaaa' : '#00f3ff';
        ctx.font = '14px "Outfit", sans-serif';
        ctx.fillText(`${Math.min(score, 99)}% Confidence`, cardX + 15, cardY + 50);

        ctx.fillStyle = '#cccccc';
        ctx.fillText(`Age: ${Math.round(detection.age)}`, cardX + 15, cardY + 80);
        ctx.fillText(`Gender: ${detection.gender}`, cardX + 15, cardY + 100);
      });

    } catch (e) {
      console.error("Detection Error:", e);
    } finally {
      isDetecting = false;
    }
  }

  // Start Loop
  detect();
});

// --- UI BUTTON LISTENER ---
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      // STOP
      toggleBtn.innerText = "START AI";
      toggleBtn.style.background = "rgba(255, 0, 85, 0.1)";
      toggleBtn.style.color = "#ff0055";
      toggleBtn.style.borderColor = "#ff0055";
      thankYouOverlay.classList.remove('hidden');
      thankYouOverlay.style.display = 'flex';
      stopCamera();

      const canvas = videoWrapper.querySelector('canvas');
      if (canvas) canvas.remove();

    } else {
      // START
      toggleBtn.innerText = "STOP AI";
      toggleBtn.style.background = "rgba(0, 243, 255, 0.1)";
      toggleBtn.style.color = "#00f3ff";
      toggleBtn.style.borderColor = "#00f3ff";
      thankYouOverlay.classList.add('hidden');
      thankYouOverlay.style.display = 'none';
      startCamera();
    }
  });
}

// --- NAVIGATION ---
const views = {
  'live': document.getElementById('view-live'),
  'analytics': document.getElementById('view-analytics'),
  'reports': document.getElementById('view-reports')
};

document.querySelectorAll('.nav-links li:not(:last-child)').forEach(item => {
  item.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    item.classList.add('active');
    Object.values(views).forEach(el => { if (el) el.style.display = 'none'; });
    const text = item.innerText.trim();

    if (text.includes('Live Feed')) {
      if (views['live']) views['live'].style.display = 'flex';
      if (!isPaused && video.paused && video.srcObject) video.play();
    } else {
      const canvas = videoWrapper.querySelector('canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (text.includes('Analytics') && views['analytics']) {
        views['analytics'].style.display = 'block';
        renderAnalytics();
      } else if (text.includes('Reports') && views['reports']) {
        views['reports'].style.display = 'block';
        renderReports();
      }
    }
  });
});

function renderAnalytics() {
  const container = document.getElementById('analytics-dashboard');
  if (!container) return;
  container.innerHTML = '';
  if (Object.keys(analytics).length === 0) {
    container.innerHTML = '<p>No data recorded yet. Go to Live Feed to start tracking.</p>';
    return;
  }
  const total = Object.values(analytics).reduce((a, b) => a + b, 0);
  for (const [emo, count] of Object.entries(analytics)) {
    if (typeof count !== 'number') continue;
    const pct = Math.round((count / total) * 100);
    const div = document.createElement('div');
    div.style.cssText = `width: 200px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);`;
    div.innerHTML = `<h3 style="text-transform: capitalize; margin-bottom: 10px; color: #fff;">${emo}</h3><div style="background: rgba(255,255,255,0.1); height: 10px; border-radius: 5px; overflow: hidden;"><div style="background: ${emo === 'sleepy' ? '#ff0055' : '#00f3ff'}; width: ${pct}%; height: 100%;"></div></div><p style="text-align: right; margin-top: 5px; color: #ccc;">${pct}%</p>`;
    container.appendChild(div);
  }
}

function renderReports() {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;
  tbody.innerHTML = logs.slice().reverse().map(l => `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding: 10px; color: #aaa;">${l.timestamp}</td><td style="padding: 10px; color: #fff; text-transform: capitalize;">${l.emotion}</td><td style="padding: 10px; color: #fff;">${l.age}</td><td style="padding: 10px; color: #fff;">${l.gender}</td></tr>`).join('');
}

const dlBtn = document.getElementById('downloadBtn');
if (dlBtn) dlBtn.addEventListener('click', () => {
  const csvContent = "data:text/csv;charset=utf-8," + "Time,Emotion,Age,Gender\n" + logs.map(e => `${e.timestamp},${e.emotion},${e.age},${e.gender}`).join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", "emotion_logs.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
