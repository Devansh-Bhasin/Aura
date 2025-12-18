const video = document.getElementById('video');
const loadingOverlay = document.getElementById('loading');
const videoWrapper = document.querySelector('.video-wrapper');

// Load all required models from the /models directory
Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/models'),
  faceapi.nets.ageGenderNet.loadFromUri('/models')
]).then(startVideo).catch(err => {
    console.error("Error loading models: ", err);
    alert("Error loading AI models. Make sure the /models folder is populated.");
});

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => {
        video.srcObject = stream;
    })
    .catch(err => console.error("Error accessing webcam: ", err));
}

video.addEventListener('play', () => {
  // Create canvas and append to wrapper
  const canvas = faceapi.createCanvasFromMedia(video);
  videoWrapper.append(canvas);
  
  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);

  // Hide loading overlay once video starts playing
  loadingOverlay.classList.add('hidden');

  setInterval(async () => {
    // Detect faces with all attributes
    const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    
    // Clear canvas for new frame
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Custom Drawing Loop
    resizedDetections.forEach(detection => {
        const box = detection.detection.box;
        
        // 1. Draw Neon Box
        ctx.strokeStyle = '#00f3ff'; // Neon Cyan
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f3ff';
        
        // Rounded rect (simplified as normal rect for canvas)
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Reset shadow
        ctx.shadowBlur = 0;

        // 2. Draw "Glass" Card Info
        const age = Math.round(detection.age);
        const gender = detection.gender;
        const expressions = detection.expressions;
        
        // Find dominant emotion
        const outcome = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
        const score = Math.round(expressions[outcome] * 100);

        // Card Properties
        const cardX = box.x + box.width + 15;
        const cardY = box.y;
        const cardWidth = 160;
        const cardHeight = 110;

        // Draw Card Background (Glass effect simulation in Canvas is just semi-transparent fill)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.roundRect ? ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 10) : ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
        ctx.fill();
        
        // Card Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Outfit", sans-serif';
        ctx.fillText(`${outcome.charAt(0).toUpperCase() + outcome.slice(1)} ${score}%`, cardX + 15, cardY + 30);
        
        ctx.font = '14px "Outfit", sans-serif';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`Age: ${age} years`, cardX + 15, cardY + 60);
        ctx.fillText(`Gender: ${gender}`, cardX + 15, cardY + 85);
    });

  }, 100); // 100ms = 10fps detection (good balance for performance)
});
