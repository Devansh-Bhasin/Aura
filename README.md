# Aura - Emotion Intelligence AI 🧠✨

**Aura** is a premium, real-time web application that uses advanced computer vision to detect emotions, age, gender, and fatigue levels directly in your browser. Built with privacy in mind, all processing happens locally on your device.

![Aura AI UI](https://via.placeholder.com/800x450?text=Aura+Emotion+AI+Interface)
*(Replace with actual screenshot)*

## 🚀 Key Features

### 🎭 Advanced Emotion Detection
- **Real-time Classification**: Instantly detects Happy, Sad, Angry, Surprised, Fearful, Disgusted, and Neutral states.
- **Enhanced "Sadness" Engine**: Finely tuned heuristics to detect subtle frowning and micro-expressions often missed by standard models.
- **Hysteresis & Smoothing**: Smart temporal smoothing algorithms prevent flickering predictions, ensuring stable and reliable results.

### 😴 Driver/User Fatigue Monitoring
- **"Sleepy" State Detection**: Uses geometric logic to track:
  - **EAR (Eye Aspect Ratio)**: Detects when eyes are half-closed or closing.
  - **Head Tilt**: Identifies nodding off or resting head positions.
  - **Flinching**: Monitors sudden jerks in eye movement patterns.
- **Audio Feedback**:
  - **Default Mode**: A subtle, professional "Beep" alert to wake you up.

### 🎉 Fun Mode (New!)
- Toggle "Fun Mode" in the sidebar to switch from professional alerts to hilarious interactions.
- Plays random, non-repeating funny audio clips (e.g., *"Dhai kilo ka hath"*, *"Khatam goodbye"*) when sleepiness is detected.

### 📊 Analytics & Reporting
- **Live Dashboard**: Visual bar charts tracking emotion trends over your session.
- **Detailed Logs**: Chronological log of every detected event with timestamps.
- **CSV Export**: Download your session data for offline analysis.

### 🎨 Premium Experience
- **Glassmorphism UI**: A stunning, modern dark-mode interface with neon accents and frosted glass effects.
- **Privacy First**: No video data is sent to the cloud. Everything runs inside your browser using `face-api.js`.

---

## 🛠️ Technology Stack

- **Core**: HTML5, Vanilla JavaScript (ES6+)
- **Styling**: CSS3 (Variables, Flexbox, Glassmorphism)
- **AI/ML Engine**: [face-api.js](https://github.com/justadudewhohacks/face-api.js) (TensorFlow.js based)
- **Models**:
  - `TinyFaceDetector` (Optimized for speed)
  - `FaceLandmark68Net` (Geometric features)
  - `FaceExpressionNet` (Emotion classification)
  - `AgeGenderNet` (Demographics)

---

## 📦 Installation & Usage

### Option 1: Live Demo
Visit the deployments at: **[Your GitHub Pages URL Here]**

### Option 2: Run Locally

1. **Clone the Repository**
   ```bash
   git clone https://github.com/Devansh-Bhasin/Aura.git
   cd Aura
   ```

2. **Serve the Application**
   Because of browser security protections for camera access, you must run this over a local server (not just opening index.html file).
   
   Using Python:
   ```bash
   # Python 3
   python -m http.server
   ```
   Or using Node.js:
   ```bash
   npx http-server
   ```

3. **Access**
   Open your browser and navigate to `http://localhost:8000`.

---

## 🎮 How to Use

1. **Start**: The AI starts automatically. Grant camera permissions when asked.
2. **Sidebar Controls**:
   - **Live Feed**: Main view with the detection overlay.
   - **Analytics**: View the emotion distribution chart.
   - **Reports**: View and download logs.
   - **Fun Mode Toggle**: Switch between "Beep" and "Funny Voices".
   - **Stop AI**: Pauses the camera and detection loop to save resources.
3. **Stop**: Click "STOP AI" to turn off the camera and see the "Thank You" screen.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Created by Devansh Bhasin** | Powered by *Antigravity*
