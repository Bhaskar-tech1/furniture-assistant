// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadContent = document.getElementById('upload-content');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image');
const generateBtn = document.getElementById('generate-btn');
const roomTypeSelect = document.getElementById('room-type');
const preferredStyleSelect = document.getElementById('preferred-style');
const customInstructions = document.getElementById('custom-instructions');

const mainCard = document.getElementById('main-card');
const loaderOverlay = document.getElementById('loader-overlay');
const loaderText = document.getElementById('loader-text');
const loaderSubtext = document.getElementById('loader-subtext');

const resultsSection = document.getElementById('results-section');
const colorSwatch = document.getElementById('color-swatch');
const colorHex = document.getElementById('color-hex');
const styleText = document.getElementById('style-text');
const furnitureContainer = document.getElementById('furniture-container');
const resetBtn = document.getElementById('reset-btn');

// Chatbot DOM elements
const chatbotWidget = document.getElementById('chatbot-widget');
const chatbotToggle = document.getElementById('chatbot-toggle');
const chatbotPanel = document.getElementById('chatbot-panel');
const chatbotClose = document.getElementById('chatbot-close');
const chatbotMessages = document.getElementById('chatbot-messages');
const chatbotInput = document.getElementById('chatbot-input');
const chatbotSend = document.getElementById('chatbot-send');
const chatbotIconOpen = document.getElementById('chatbot-icon-open');
const chatbotIconClose = document.getElementById('chatbot-icon-close');

// Room Visualization DOM elements removed

let selectedFile = null;
let currentSuggestionContext = null; 
let chatHistory = []; 

// Because the backend now serves the frontend, we can just use relative paths (e.g. '/generate' instead of 'http://.../generate')
const API_BASE_URL = '';

// Event Listeners
dropZone.addEventListener('click', () => { if (!selectedFile) fileInput.click(); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUpload();
});

generateBtn.addEventListener('click', handleGenerate);
resetBtn.addEventListener('click', resetApp);

function handleFile(file) {
    if (!file.type.startsWith('image/')) { alert('Please upload an image file.'); return; }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.classList.remove('hidden');
        uploadContent.classList.add('hidden');
        removeImageBtn.classList.remove('hidden');
        generateBtn.disabled = false;
        dropZone.style.padding = '1rem';
    };
    reader.readAsDataURL(file);
}

function resetUpload() {
    selectedFile = null;
    fileInput.value = '';
    imagePreview.src = '';
    imagePreview.classList.add('hidden');
    uploadContent.classList.remove('hidden');
    removeImageBtn.classList.add('hidden');
    generateBtn.disabled = true;
    dropZone.style.padding = '3rem 2rem';
}

async function handleGenerate() {
    if (!selectedFile) return;
    loaderOverlay.classList.remove('hidden');
    
    try {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('room_type', roomTypeSelect.value);
        formData.append('preferred_style', preferredStyleSelect.value);
        formData.append('custom_instructions', customInstructions.value);
        
        const generateRes = await fetch(`${API_BASE_URL}/generate`, {
            method: 'POST',
            body: formData
        });
        
        if (!generateRes.ok) throw new Error('Failed to generate suggestions');
        const generateData = await generateRes.json();
        
        displayResults(generateData);
        
    } catch (error) {
        console.error(error);
        alert('Error connecting to server.');
    } finally {
        loaderOverlay.classList.add('hidden');
    }
}

function displayResults(data) {
    currentSuggestionContext = data;
    chatHistory = []; 

    mainCard.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    chatbotWidget.classList.remove('hidden');
    
    const domColor = data.dominant_color || '#000000';
    colorSwatch.style.backgroundColor = domColor;
    colorHex.textContent = domColor.toUpperCase();
    styleText.textContent = data.style_description || 'Tailored suggestions for your room.';
    
    furnitureContainer.innerHTML = '';
    
    if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'furniture-card';
            
            let iconClass = 'fa-couch';
            const lowerName = item.name.toLowerCase();
            if (lowerName.includes('table') || lowerName.includes('desk')) iconClass = 'fa-table';
            else if (lowerName.includes('chair') || lowerName.includes('stool')) iconClass = 'fa-chair';
            else if (lowerName.includes('lamp') || lowerName.includes('light')) iconClass = 'fa-lightbulb';
            
            const itemColor = item.suggested_color_hex || '#cccccc';
            const imageUrl = item.image_url || 'https://loremflickr.com/512/512/furniture';

            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${imageUrl}" alt="${item.name}" class="furniture-gen-image loaded" style="opacity:1 !important;" />
                    <div class="item-color-indicator overlay-color">
                        <div class="item-swatch" style="background-color: ${itemColor};"></div>
                    </div>
                </div>
                <div class="card-header">
                    <i class="fa-solid ${iconClass} furniture-icon"></i>
                    <h3>${item.name}</h3>
                </div>
                <div class="card-content">
                    <p>${item.description}</p>
                </div>
                <div class="reason-badge">
                   <strong>Match:</strong> ${item.reason}
                </div>
            `;
            furnitureContainer.appendChild(card);
        });
    }

    // Visualization section removed
}

function resetApp() {
    resultsSection.classList.add('hidden');
    mainCard.classList.remove('hidden');
    resetUpload();
    chatbotWidget.classList.add('hidden');
}

// Chatbot
chatbotToggle.addEventListener('click', () => {
    chatbotPanel.classList.toggle('hidden');
    chatbotIconOpen.classList.toggle('hidden');
    chatbotIconClose.classList.toggle('hidden');
});

chatbotSend.addEventListener('click', sendChatMessage);
chatbotInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

async function sendChatMessage() {
    const message = chatbotInput.value.trim();
    if (!message) return;

    appendMessage('user', message);
    chatbotInput.value = '';

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'chat-message bot-message';
    typingIndicator.innerHTML = `
        <div class="message-bubble" style="background: transparent; padding: 0;">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatbotMessages.appendChild(typingIndicator);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{role:'user', content:message}], context: currentSuggestionContext })
        });
        const data = await response.json();
        chatbotMessages.removeChild(typingIndicator);
        appendMessage('bot', data.reply);
    } catch (err) {
        chatbotMessages.removeChild(typingIndicator);
        appendMessage('bot', 'Error connecting to assistant.');
    }
}

function appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role === 'user' ? 'user-message' : 'bot-message'}`;
    msgDiv.innerHTML = `<div class="message-bubble">${text}</div>`;
    chatbotMessages.appendChild(msgDiv);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}
