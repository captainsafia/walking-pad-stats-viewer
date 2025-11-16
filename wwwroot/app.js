let video, canvas, ctx;
let stream = null;
let autoCapture = false;
let captureInterval = null;
let history = [];
let totalCaptures = 0;
let successfulCaptures = 0;

const CAPTURE_INTERVAL = 20000;

async function init() {
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    loadHistory();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus('Camera API not available.', 'error');
        document.getElementById('startBtn').disabled = true;
        return;
    }

    document.getElementById('startBtn').addEventListener('click', startCamera);
    document.getElementById('stopBtn').addEventListener('click', stopCamera);
    document.getElementById('toggleAutoBtn').addEventListener('click', toggleAutoCapture);
    document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('uploadInput').click();
    });
    document.getElementById('uploadInput').addEventListener('change', handleImageUpload);
}

async function startCamera() {
    try {
        updateStatus('Starting camera...', 'info');

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });

        video.srcObject = stream;

        document.getElementById('startBtn').disabled = true;
        document.getElementById('toggleAutoBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;

        updateStatus('Camera started. Ready to capture.', 'success');
    } catch (error) {
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = null;
    }

    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
        autoCapture = false;
    }

    document.getElementById('startBtn').disabled = false;
    document.getElementById('toggleAutoBtn').disabled = true;
    document.getElementById('toggleAutoBtn').textContent = 'Start Auto-Capture';
    document.getElementById('stopBtn').disabled = true;

    updateStatus('Camera stopped.', 'info');
}

function toggleAutoCapture() {
    autoCapture = !autoCapture;
    const btn = document.getElementById('toggleAutoBtn');

    if (autoCapture) {
        btn.textContent = 'Stop Auto-Capture';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-danger');
        updateStatus(`Auto-capture enabled. Capturing every 5 seconds.`, 'success');

        captureFrame();

        captureInterval = setInterval(() => {
            captureFrame();
        }, CAPTURE_INTERVAL);
    } else {
        btn.textContent = 'Start Auto-Capture';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-secondary');
        clearInterval(captureInterval);
        captureInterval = null;
        updateStatus('Auto-capture disabled.', 'info');
    }
}

async function analyzeImageWithAzure(imageUrl) {
    try {
        // Call backend API endpoint with image URL as query parameter
        const response = await fetch(`/api/analyze?imageUrl=${encodeURIComponent(imageUrl)}`);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Analysis failed: ${response.status} - ${error}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        throw error;
    }
}

async function uploadToAzureStorage(imageCanvas) {
    try {
        // Convert canvas to blob
        const blob = await new Promise(resolve => imageCanvas.toBlob(resolve, 'image/png'));
        
        // Upload to API endpoint
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'image/png'
            },
            body: blob
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Storage upload failed: ${response.status} - ${error}`);
        }
        
        const result = await response.json();
        return result.url;
    } catch (error) {
        throw error;
    }
}

function formatCapturedValues(data) {
    // data is now a JSON object like: {"time": "23:48", "speed": "3.0", "distance": "1.1"}
    // or {"calories": "123", "speed": "3.0", "steps": "1234"}
    
    if (!data || typeof data !== 'object') return null;
    
    // Determine which fields are present
    const time = data.time || '--';
    const calories = data.calories || '--';
    const speed = data.speed || '--';
    const steps = data.steps || '--';
    const distance = data.distance || '--';
    
    // Return structured data with all 5 fields
    return {
        time,
        calories,
        speed,
        steps,
        distance,
        formatted: `Time: ${time} | Cal: ${calories} | Speed: ${speed} | Steps: ${steps} | Dist: ${distance}`
    };
}

async function processAndAnalyzeImage() {
    // Display the captured image
    const imageData = canvas.toDataURL('image/png');
    document.getElementById('lastCaptured').src = imageData;
    document.getElementById('lastCaptured').style.display = 'block';
    document.getElementById('capturedPlaceholder').style.display = 'none';

    totalCaptures++;

    updateStatus('Uploading to Azure Storage...', 'processing');

    try {
        // Upload to Azure Storage first
        const imageUrl = await uploadToAzureStorage(canvas);
        
        updateStatus('Analyzing with Azure AI Vision...', 'processing');
        
        // Analyze using the blob URL
        const data = await analyzeImageWithAzure(imageUrl);
        
        const formattedData = formatCapturedValues(data);

        if (formattedData) {
            successfulCaptures++;
            addToHistory(formattedData);
            updateStatus(`Captured: ${formattedData.formatted}`, 'success');
        } else {
            updateStatus('No text detected in image.', 'error');
        }
    } catch (error) {
        updateStatus(`OCR Error: ${error.message}`, 'error');
    }

    updateStats();
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        updateStatus('Loading uploaded image...', 'processing');

        const img = new Image();
        const reader = new FileReader();

        reader.onload = async (e) => {
            img.onload = async () => {
                // Draw image to canvas
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                await processAndAnalyzeImage();
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    } catch (error) {
        updateStatus(`Error: ${error.message}`, 'error');
    }

    // Reset file input
    event.target.value = '';
}

async function captureFrame() {
    if (!stream) return;

    try {
        updateStatus('Capturing frame...', 'processing');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        await processAndAnalyzeImage();

    } catch (error) {
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

function updateStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
}

function addToHistory(data) {
    const entry = {
        timestamp: Date.now(),
        time: data.time,
        calories: data.calories,
        speed: data.speed,
        steps: data.steps,
        distance: data.distance
    };

    history.unshift(entry);

    if (history.length > 100) {
        history = history.slice(0, 100);
    }

    saveHistory();
    renderHistory();
}

function renderHistory() {
    const table = document.getElementById('historyTable');
    const tbody = document.getElementById('historyTableBody');
    const noHistoryMsg = document.getElementById('noHistoryMessage');

    if (history.length === 0) {
        table.style.display = 'none';
        noHistoryMsg.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    noHistoryMsg.style.display = 'none';

    tbody.innerHTML = history.map(entry => {
        const date = new Date(entry.timestamp);
        return `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${date.toLocaleString()}</td>
                <td style="padding: 10px;">${entry.time || '--'}</td>
                <td style="padding: 10px;">${entry.calories || '--'}</td>
                <td style="padding: 10px;">${entry.speed || '--'}</td>
                <td style="padding: 10px;">${entry.steps || '--'}</td>
                <td style="padding: 10px;">${entry.distance || '--'}</td>
            </tr>
        `;
    }).join('');
}

function updateStats() {
    document.getElementById('totalCaptures').textContent = totalCaptures;

    const rate = totalCaptures > 0 ? Math.round((successfulCaptures / totalCaptures) * 100) : 0;
    document.getElementById('successRate').textContent = `${rate}%`;
}

function saveHistory() {
    try {
        localStorage.setItem('walkingPadHistory', JSON.stringify(history));
        localStorage.setItem('walkingPadStats', JSON.stringify({
            totalCaptures,
            successfulCaptures
        }));
    } catch (error) {
        // Silently fail if localStorage is unavailable
    }
}

function loadHistory() {
    try {
        const savedHistory = localStorage.getItem('walkingPadHistory');
        const savedStats = localStorage.getItem('walkingPadStats');

        if (savedHistory) {
            history = JSON.parse(savedHistory);
            renderHistory();
        }

        if (savedStats) {
            const stats = JSON.parse(savedStats);
            totalCaptures = stats.totalCaptures || 0;
            successfulCaptures = stats.successfulCaptures || 0;
            updateStats();
        }
    } catch (error) {
        // Silently fail if localStorage is unavailable
    }
}

function clearHistory() {
    if (confirm('Are you sure you want to clear all history?')) {
        history = [];
        totalCaptures = 0;
        successfulCaptures = 0;
        localStorage.removeItem('walkingPadHistory');
        localStorage.removeItem('walkingPadStats');
        renderHistory();
        updateStats();
        document.getElementById('currentValue').textContent = '--';
        document.getElementById('lastUpdate').textContent = 'Waiting for data...';
        updateStatus('History cleared.', 'info');
    }
}

window.addEventListener('load', init);

window.addEventListener('beforeunload', () => {
    stopCamera();
});
