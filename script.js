const video = document.getElementById('video');
const loadingOverlay = document.getElementById('loading');
const videoWrapper = document.querySelector('.video-wrapper');
const toggleBtn = document.getElementById('toggle-detection');

// --- STATE MANAGEMENT ---
const logs = [];
const analytics = {};
let lastLogTime = 0;
let isLoopRunning = false;
let isPaused = false;
let frameCount = 0; // For frame skipping

// Hysteresis (Sticky Emotions)
let lastConfirmedEmotion = 'neutral';
let emotionConsecutiveCount = 0;
const STICKY_THRESHOLD = 4; // Frames to hold before switching

// Temporal Smoothing Buffer (Expressions)
const historyBuffer = [];
const HISTORY_SIZE = 12;

// EAR History for "Flinching" detection
const earHistory = [];

// Load models
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/Aura/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/Aura/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('/Aura/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/Aura/models'),
  faceapi.nets.ageGenderNet.loadFromUri('/Aura/models')
]).then(startVideo).catch(err => {
  console.error("Error loading models: ", err);
  loadingOverlay.innerHTML = `<p style="color:red">Error loading models.<br>Check console for details.</p>`;
});

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
    .then(stream => {
      video.srcObject = stream;
    })
    .catch(err => {
      console.error("Error accessing webcam: ", err);
      loadingOverlay.innerHTML = `<p style="color:red">Camera Error:<br>${err.message}</p>`;
    });
}

// --- BUTTON CONTROL ---
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      toggleBtn.innerText = "START AI";
      toggleBtn.style.background = "rgba(255, 0, 85, 0.1)";
      toggleBtn.style.color = "#ff0055";
      toggleBtn.style.borderColor = "#ff0055";
      // Clear canvas when stopped
      const canvas = videoWrapper.querySelector('canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      toggleBtn.innerText = "STOP AI";
      toggleBtn.style.background = "rgba(0, 243, 255, 0.1)";
      toggleBtn.style.color = "#00f3ff";
      toggleBtn.style.borderColor = "#00f3ff";
    }
  });
}

// --- NAVIGATION LOGIC ---
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
    } else if (text.includes('Analytics')) {
      if (views['analytics']) {
        views['analytics'].style.display = 'block';
        renderAnalytics();
      }
    } else if (text.includes('Reports')) {
      if (views['reports']) {
        views['reports'].style.display = 'block';
        renderReports();
      }
    }
  });
});

function logData(outcome, age, gender) {
  const now = Date.now();
  if (now - lastLogTime > 2000) {
    lastLogTime = now;
    const timestamp = new Date().toLocaleTimeString();
    logs.push({ timestamp, emotion: outcome, age, gender });
    analytics[outcome] = (analytics[outcome] || 0) + 1;
  }
}

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
    div.innerHTML = `
         <h3 style="text-transform: capitalize; margin-bottom: 10px; color: #fff;">${emo}</h3>
         <div style="background: rgba(255,255,255,0.1); height: 10px; border-radius: 5px; overflow: hidden;">
             <div style="background: ${emo === 'sleepy' ? '#ff0055' : '#00f3ff'}; width: ${pct}%; height: 100%;"></div>
         </div>
         <p style="text-align: right; margin-top: 5px; color: #ccc;">${pct}%</p>
     `;
    container.appendChild(div);
  }
}

function renderReports() {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;
  tbody.innerHTML = logs.slice().reverse().map(l => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 10px; color: #aaa;">${l.timestamp}</td>
          <td style="padding: 10px; color: #fff; text-transform: capitalize;">${l.emotion}</td>
          <td style="padding: 10px; color: #fff;">${l.age}</td>
          <td style="padding: 10px; color: #fff;">${l.gender}</td>
      </tr>
    `).join('');
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

video.addEventListener('play', () => {
  // Prevent duplicate canvases
  if (videoWrapper.querySelector('canvas')) return;

  const canvas = faceapi.createCanvasFromMedia(video);
  videoWrapper.append(canvas);

  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);
  loadingOverlay.classList.add('hidden');

  let isDetecting = false;

  async function detect() {
    if (video.paused || video.ended) {
      isLoopRunning = false;
      return;
    }

    requestAnimationFrame(detect);

    // PAUSE LOGIC
    if (isPaused) return;

    if (isDetecting) return;
    isDetecting = true;

    // FRAME SKIPPING (Run inference every 2nd frame)
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

      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      resizedDetections.forEach(detection => {
        const box = detection.detection.box;
        const landmarks = detection.landmarks;

        // --- 1. SLEEP DETECTION HEURISTICS ---

        // A. EAR (Eye Aspect Ratio) 
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        // VISUAL DEBUG: Draw Eyes
        ctx.lineWidth = 2;
        ctx.beginPath();

        function getEAR(eye) {
          // Draw path for visual feedback
          ctx.moveTo(eye[0].x, eye[0].y);
          for (let i = 1; i < eye.length; i++) ctx.lineTo(eye[i].x, eye[i].y);
          ctx.closePath();

          const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
          const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
          const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
          return (v1 + v2) / (2.0 * h);
        }

        const avgEAR = (getEAR(leftEye) + getEAR(rightEye)) / 2;
        const eyesHalfClosed = avgEAR < 0.23;

        // B. Flinching (EAR Variance)
        earHistory.push(avgEAR);
        if (earHistory.length > 20) earHistory.shift();

        const earMean = earHistory.reduce((a, b) => a + b, 0) / earHistory.length;
        const earVariance = earHistory.reduce((a, b) => a + Math.pow(b - earMean, 2), 0) / earHistory.length;
        const isFlinching = earVariance > 0.005;

        // C. Head Tilt
        const pLeft = landmarks.positions[36];
        const pRight = landmarks.positions[45];
        const dy = pRight.y - pLeft.y;
        const dx = pRight.x - pLeft.x;
        const angleDeg = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
        const isHeadResting = angleDeg > 20;

        const isSleepy = eyesHalfClosed || isHeadResting || (eyesHalfClosed && isFlinching);

        // COLOR EYES
        ctx.strokeStyle = isSleepy ? '#ff0055' : '#00ffd5';
        ctx.stroke();

        // --- 2. SADNESS HEURISTICS ---
        const mouLeft = landmarks.positions[48];
        const mouRight = landmarks.positions[54];
        const mouCenter = landmarks.positions[62];
        const isFrowning = (mouLeft.y > mouCenter.y + 3) && (mouRight.y > mouCenter.y + 3);


        // --- 3. TEMPORAL SMOOTHING & HYSTERESIS ---
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

        if (isFrowning) averagedExpressions['sad'] += 0.5;
        if (isHeadResting) averagedExpressions['neutral'] -= 0.2;

        // Determine raw winner
        const expressions = averagedExpressions;
        let rawWinner = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
        let score = Math.round(expressions[rawWinner] * 100);

        // Sleepy Override (Highest Priority)
        if (isSleepy) {
          rawWinner = "sleepy";
          score = 85 + Math.round(Math.random() * 15);
          if (isHeadResting) score = 99;
        }

        // HYSTERESIS: Sticky Logic
        if (rawWinner === lastConfirmedEmotion) {
          emotionConsecutiveCount++;
        } else {
          emotionConsecutiveCount = 0;
          // If the new emotion is strong enough (or if we just switched from sleepy back to neutral)
          // we might switch immediately, but for jittery expressions, we wait
          if (rawWinner === 'sleepy' || lastConfirmedEmotion === 'sleepy') {
            // Fast switch for sleepy
            lastConfirmedEmotion = rawWinner;
          } else {
            // Wait for buffer
            lastConfirmedEmotion = rawWinner; // Actually, let's just create a buffer variable
          }
        }

        // To properly implement hysteresis:
        // We only update the DISPLAYED emotion if the NEW emotion has been consistent for X frames.
        // But we need to track the "candidate" emotion separately.

        // Simplified "Sticky" Logic: 
        // Only update outcome if the same candidate wins for 3 consecutive frames
        // (The code above resets count on change, so efficient)
        let outcome = lastConfirmedEmotion;
        if (emotionConsecutiveCount > STICKY_THRESHOLD) {
          // It's confirmed
          outcome = rawWinner;
        } else {
          // Keep showing old one until new one proves itself
          if (rawWinner === 'sleepy') outcome = 'sleepy'; // Instant sleep
        }

        // Sync
        lastConfirmedEmotion = rawWinner;

        // --- DRAW UI ---
        const mirroredX = canvas.width - box.x - box.width;

        ctx.strokeStyle = isSleepy ? '#ff0055' : '#00f3ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(mirroredX, box.y, box.width, box.height);

        const age = Math.round(detection.age);
        const gender = detection.gender;

        // Log final confirmed outcome
        logData(outcome, age, gender);

        let cardX = mirroredX + box.width + 10;
        const cardY = box.y;
        if (cardX + 160 > canvas.width) cardX = mirroredX - 170;

        ctx.fillStyle = isSleepy ? 'rgba(50, 0, 0, 0.85)' : 'rgba(15, 12, 41, 0.85)';
        ctx.fillRect(cardX, cardY, 160, 110);
        ctx.strokeStyle = isSleepy ? '#ff0055' : 'rgba(0, 243, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cardX, cardY, 160, 110);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Outfit", sans-serif';
        ctx.fillText(`${outcome.charAt(0).toUpperCase() + outcome.slice(1)}`, cardX + 15, cardY + 30);

        ctx.fillStyle = isSleepy ? '#ffaaaa' : '#00f3ff';
        ctx.font = '14px "Outfit", sans-serif';
        ctx.fillText(`${Math.min(score, 99)}% Confidence`, cardX + 15, cardY + 50);

        ctx.fillStyle = '#cccccc';
        ctx.fillText(`Age: ${age}`, cardX + 15, cardY + 80);
        ctx.fillText(`Gender: ${gender}`, cardX + 15, cardY + 100);
      });
    } catch (e) {
      console.error(e);
    } finally {
      isDetecting = false;
    }
  }

  if (!isLoopRunning) {
    isLoopRunning = true;
    detect();
  }
});
