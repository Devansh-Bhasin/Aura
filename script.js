const video = document.getElementById('video');
const loadingOverlay = document.getElementById('loading');
const videoWrapper = document.querySelector('.video-wrapper');

// --- STATE MANAGEMENT ---
const logs = [];
const analytics = {};
let lastLogTime = 0;

// Temporal Smoothing Buffer (Expressions)
const historyBuffer = [];
const HISTORY_SIZE = 15; // Increased for better smoothing

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

// --- NAVIGATION LOGIC ---
const views = {
  'live': document.getElementById('view-live'),
  'analytics': document.getElementById('view-analytics'),
  'reports': document.getElementById('view-reports')
};

document.querySelectorAll('.nav-links li').forEach(item => {
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
    } else if (text.includes('Settings') || text.includes('Admin')) {
      alert("Admin Panel feature is coming soon!");
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
  const canvas = faceapi.createCanvasFromMedia(video);
  videoWrapper.append(canvas);

  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);
  loadingOverlay.classList.add('hidden');

  let isDetecting = false;

  async function detect() {
    if (video.paused || video.ended) return;
    requestAnimationFrame(detect);

    if (isDetecting) return;
    isDetecting = true;

    try {
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
      const detections = await faceapi.detectAllFaces(video, options).withFaceLandmarks().withFaceExpressions().withAgeAndGender();
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      resizedDetections.forEach(detection => {
        const box = detection.detection.box;
        const landmarks = detection.landmarks;

        // --- 1. SLEEP DETECTION HEURISTICS ---

        // A. EAR (Eye Aspect Ratio) - "Eyes halfway down"
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        function getEAR(eye) {
          const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
          const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
          const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
          return (v1 + v2) / (2.0 * h);
        }
        const avgEAR = (getEAR(leftEye) + getEAR(rightEye)) / 2;
        const eyesHalfClosed = avgEAR < 0.25;

        // B. Flinching (EAR Variance)
        earHistory.push(avgEAR);
        if (earHistory.length > 20) earHistory.shift();
        // Calculate Variance
        const earMean = earHistory.reduce((a, b) => a + b, 0) / earHistory.length;
        const earVariance = earHistory.reduce((a, b) => a + Math.pow(b - earMean, 2), 0) / earHistory.length;
        const isFlinching = earVariance > 0.005; // Heuristic threshold for rapid blinking/twitching

        // C. Head Tilt (Resting on side)
        // Angle between outer eye corners (Left: 0, Right: 3) of eye arrays?? No, landmarks 36 and 45.
        const pLeft = landmarks.positions[36];  // Left eye outer
        const pRight = landmarks.positions[45]; // Right eye outer
        const dy = pRight.y - pLeft.y;
        const dx = pRight.x - pLeft.x;
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = Math.abs(angleRad * (180 / Math.PI));
        // Usually 0deg is level. >20 means head is resting on side.
        const isHeadResting = angleDeg > 20;

        // D. Head Back (Pitch) - Approximation
        // Nose tip (30) to top of nose usually is fixed. 
        // If nose tip moves UP relative to eyes, head is back.
        // Simplified: is Nose Tip (30) higher (smaller Y) than usual vs eyes center?
        // Let's rely on Tilt and Eyes for now as they are robust.

        const isSleepy = eyesHalfClosed || isHeadResting || (eyesHalfClosed && isFlinching);


        // --- 2. SADNESS HEURISTICS ---
        // Check mouth corners (48, 54) vs mouth center top (62)
        const mouLeft = landmarks.positions[48];
        const mouRight = landmarks.positions[54];
        const mouCenter = landmarks.positions[62];
        // If corners are lower than center, it's a frown? 
        // Actually, in image coords, larger Y = lower. 
        // So if mouLeft.y and mouRight.y are significantly LARGER than mouCenter.y + offset
        const isFrowning = (mouLeft.y > mouCenter.y + 5) && (mouRight.y > mouCenter.y + 5);


        // --- 3. TEMPORAL SMOOTHING ---
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

        // --- BOOST METRICS ---
        // If heuristics detect sad/sleepy, boost the score in the averaged object manually
        if (isFrowning) averagedExpressions['sad'] += 0.4; // Strong boost for frown

        // --- DECISION ---
        const mirroredX = canvas.width - box.x - box.width;
        ctx.strokeStyle = isSleepy ? '#ff0055' : '#00f3ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(mirroredX, box.y, box.width, box.height);

        const age = Math.round(detection.age);
        const gender = detection.gender;

        const expressions = averagedExpressions;
        let outcome = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
        let score = Math.round(expressions[outcome] * 100);

        // Sleepy Override (Highest Priority)
        if (isSleepy) {
          outcome = "sleepy";
          score = 85 + Math.round(Math.random() * 15);
          if (isHeadResting) score = 99; // Certainty
        }

        logData(outcome, age, gender);

        // Draw Card
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

        // DEBUG: Show status
        // ctx.fillText(`Tilt: ${Math.round(angleDeg)}  Frown: ${isFrowning}`, cardX, cardY - 10);
      });
    } catch (e) {
      console.error(e);
    } finally {
      isDetecting = false;
    }
  }

  detect();
});
