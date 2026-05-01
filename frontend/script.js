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

// Room Visualization DOM elements
const vizImage = document.getElementById('viz-image');
const vizSkeleton = document.getElementById('viz-skeleton');

let selectedFile = null;
let dominantColor = null;
let currentSuggestionContext = null; // Stores the AI response for chatbot context
let chatHistory = []; // Conversation history for the chatbot
let imageQueue = [];
let isGeneratingImage = false;

const API_BASE_URL = 'http://localhost:5001';

// Event Listeners for Drag and Drop
dropZone.addEventListener('click', () => {
    if (!selectedFile) fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUpload();
});

generateBtn.addEventListener('click', handleGenerate);
resetBtn.addEventListener('click', resetApp);

// Functions
function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
    }
    
    selectedFile = file;
    
    // Show preview
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
    
    // Show Loader
    loaderOverlay.classList.remove('hidden');
    loaderText.textContent = "Analyzing structure & lighting...";
    loaderSubtext.textContent = "Gathering context through AI vision pipelines.";
    
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
        
        // Reset queue for new suggestions
        imageQueue = [];
        isGeneratingImage = false;
        
        displayResults(generateData);
        
    } catch (error) {
        console.error(error);
        alert('Oops! Something went wrong communicating with the server. Ensure the backend is running.');
    } finally {
        // Hide loader
        loaderOverlay.classList.add('hidden');
    }
}

function displayResults(data) {
    // Store the full context for the chatbot
    currentSuggestionContext = data;
    chatHistory = []; // Reset chat history for new suggestions

    // Hide main card, show results
    mainCard.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    
    // Show the chatbot widget
    chatbotWidget.classList.remove('hidden');
    
    // Update color swatches
    const domColor = data.dominant_color || '#000000';
    colorSwatch.style.backgroundColor = domColor;
    colorHex.textContent = domColor.toUpperCase();
    
    // Update text
    styleText.textContent = data.style_description || 'A bespoke selection tailored exactly for your room constraints.';
    
    // Populate furniture grid
    furnitureContainer.innerHTML = '';
    
    if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'furniture-card';
            
            // Basic logic to assign a random icon based on name
            let iconClass = 'fa-couch'; // Default
            const lowerName = item.name.toLowerCase();
            if (lowerName.includes('table') || lowerName.includes('desk')) iconClass = 'fa-table';
            else if (lowerName.includes('chair') || lowerName.includes('stool')) iconClass = 'fa-chair';
            else if (lowerName.includes('lamp') || lowerName.includes('light')) iconClass = 'fa-lamp';
            else if (lowerName.includes('bed')) iconClass = 'fa-bed';
            else if (lowerName.includes('art') || lowerName.includes('plant')) iconClass = 'fa-leaf';
            else if (lowerName.includes('rug') || lowerName.includes('carpet')) iconClass = 'fa-map';
            
            const itemColor = item.suggested_color_hex || '#cccccc';
            
            // Build heavily detailed visual prompt for the image generator
            const imagePrompt = `A ${item.name}, highly detailed, photorealistic, professional studio lighting, 8k, modern clean interior design style, standalone against a clean bright studio background. The main color of the furniture is uniquely ${itemColor}.`;
            const encodedPrompt = encodeURIComponent(imagePrompt);
            // We route through our backend which securely holds the Hugging Face Token!
            const imageUrl = `${API_BASE_URL}/generate-image?prompt=${encodedPrompt}`;

            card.innerHTML = `
                <div class="card-image-container">
                    <div class="skeleton-loader">
                        <i class="fa-solid fa-image skeleton-icon"></i>
                    </div>
                    <img alt="${item.name}" class="furniture-gen-image" />
                    <div class="item-color-indicator overlay-color">
                        <span>Hex:</span>
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
                   <strong>Why this works:</strong> ${item.reason}
                </div>
            `;
            furnitureContainer.appendChild(card);

            // Lazy loading: listen for image load to hide skeleton
            const img = card.querySelector('.furniture-gen-image');
            const skeleton = card.querySelector('.skeleton-loader');
            img.addEventListener('load', () => {
                img.classList.add('loaded');
                skeleton.style.display = 'none';
            });
            img.addEventListener('error', () => {
                // On error, show a fallback state
                skeleton.innerHTML = '<i class="fa-solid fa-image-slash skeleton-icon"></i>';
            });
            
            // Queue the image generation
            imageQueue.push({ imgElement: img, srcUrl: imageUrl });
        });
    } else {
        furnitureContainer.innerHTML = '<p>No specific items returned. Please try again.</p>';
    }

    // Auto-generate the room visualization with all suggested items
    generateRoomVisualization(data);
}

function generateRoomVisualization(data) {
    // Reset visualization state
    vizImage.classList.remove('loaded');
    vizImage.src = '';
    vizSkeleton.style.display = 'flex';
    vizSkeleton.innerHTML = `
        <i class="fa-solid fa-wand-magic-sparkles skeleton-icon"></i>
        <span class="viz-loading-text">Generating your dream room...</span>
    `;

    // Build a rich prompt combining room details + all suggested items
    const roomType = data.room_type || roomTypeSelect.value || 'room';
    const style = data.preferred_style || preferredStyleSelect.value || 'modern';
    const dominantColor = data.dominant_color || '#000000';

    let itemDescriptions = '';
    if (data.items && data.items.length > 0) {
        itemDescriptions = data.items.map(item => {
            return `a ${item.name} in ${item.suggested_color_hex || 'neutral'} color`;
        }).join(', ');
    }

    const vizPrompt = `A beautifully designed ${style} ${roomType} interior, photorealistic, professional interior photography, 8k resolution, warm natural lighting, styled with ${itemDescriptions}. The room has a dominant color palette of ${dominantColor}. Magazine-quality interior design photograph, wide angle shot, highly detailed.`;

    const encodedPrompt = encodeURIComponent(vizPrompt);
    const vizUrl = `${API_BASE_URL}/generate-image?prompt=${encodedPrompt}`;

    vizImage.addEventListener('load', function onVizLoad() {
        vizImage.classList.add('loaded');
        vizSkeleton.style.display = 'none';
        vizImage.removeEventListener('load', onVizLoad);
    });

    vizImage.addEventListener('error', function onVizError() {
        vizSkeleton.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation skeleton-icon"></i>
            <span class="viz-loading-text">Could not generate visualization. Try again later.</span>
        `;
        vizImage.removeEventListener('error', onVizError);
    });
    
    // Queue room viz image
    imageQueue.push({ imgElement: vizImage, srcUrl: vizUrl });
    
    // Start processing queue
    processImageQueue();
}

async function processImageQueue() {
    if (isGeneratingImage || imageQueue.length === 0) return;
    
    isGeneratingImage = true;
    const task = imageQueue.shift();
    
    try {
        const response = await fetch(task.srcUrl);
        if (response.ok) {
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            task.imgElement.src = objectUrl;
        } else {
            task.imgElement.dispatchEvent(new Event('error'));
        }
    } catch (e) {
        task.imgElement.dispatchEvent(new Event('error'));
    }
    
    isGeneratingImage = false;
    processImageQueue();
}

function resetApp() {
    resultsSection.classList.add('hidden');
    mainCard.classList.remove('hidden');
    resetUpload();
    roomTypeSelect.value = '';
    preferredStyleSelect.value = 'Modern';
    customInstructions.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Reset room visualization
    vizImage.classList.remove('loaded');
    vizImage.src = '';
    vizSkeleton.style.display = 'flex';
    vizSkeleton.innerHTML = `
        <i class="fa-solid fa-wand-magic-sparkles skeleton-icon"></i>
        <span class="viz-loading-text">Generating your dream room...</span>
    `;

    // Reset chatbot
    chatbotWidget.classList.add('hidden');
    chatbotPanel.classList.add('hidden');
    chatbotIconOpen.classList.remove('hidden');
    chatbotIconClose.classList.add('hidden');
    currentSuggestionContext = null;
    chatHistory = [];
    imageQueue = [];
    isGeneratingImage = false;
    // Reset messages to the default welcome
    chatbotMessages.innerHTML = `
        <div class="chat-message bot-message">
            <div class="message-bubble">
                👋 Hi! I'm your design assistant. Ask me anything about the furniture suggestions — alternatives, pricing tips, layout ideas, or color questions!
            </div>
        </div>
    `;
}

// ============================
// Chatbot Logic
// ============================

// Toggle chat panel open/close
chatbotToggle.addEventListener('click', () => {
    const isOpen = !chatbotPanel.classList.contains('hidden');
    if (isOpen) {
        closeChatPanel();
    } else {
        openChatPanel();
    }
});

chatbotClose.addEventListener('click', closeChatPanel);

function openChatPanel() {
    chatbotPanel.classList.remove('hidden');
    chatbotIconOpen.classList.add('hidden');
    chatbotIconClose.classList.remove('hidden');
    chatbotInput.focus();
    scrollChatToBottom();
}

function closeChatPanel() {
    chatbotPanel.classList.add('hidden');
    chatbotIconOpen.classList.remove('hidden');
    chatbotIconClose.classList.add('hidden');
}

// Send message on button click
chatbotSend.addEventListener('click', sendChatMessage);

// Send message on Enter key
chatbotInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

async function sendChatMessage() {
    const message = chatbotInput.value.trim();
    if (!message) return;

    // Display user message
    appendMessage('user', message);
    chatbotInput.value = '';
    chatbotSend.disabled = true;

    // Add to history
    chatHistory.push({ role: 'user', content: message });

    // Show typing indicator
    const typingEl = showTypingIndicator();

    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                context: currentSuggestionContext
            })
        });

        if (!response.ok) throw new Error('Chat request failed');
        const data = await response.json();

        // Remove typing indicator
        typingEl.remove();

        const reply = data.reply || "Sorry, I couldn't process that. Please try again.";
        appendMessage('bot', reply);
        chatHistory.push({ role: 'assistant', content: reply });

    } catch (err) {
        console.error('Chat error:', err);
        typingEl.remove();
        appendMessage('bot', '⚠️ Something went wrong. Please check if the server is running and try again.');
    } finally {
        chatbotSend.disabled = false;
        chatbotInput.focus();
    }
}

function appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role === 'user' ? 'user-message' : 'bot-message'}`;
    msgDiv.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
    chatbotMessages.appendChild(msgDiv);
    scrollChatToBottom();
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message bot-message';
    typingDiv.innerHTML = `
        <div class="message-bubble typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    chatbotMessages.appendChild(typingDiv);
    scrollChatToBottom();
    return typingDiv;
}

function scrollChatToBottom() {
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
