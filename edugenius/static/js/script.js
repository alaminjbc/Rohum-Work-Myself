// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcome = document.getElementById('welcome');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const docBtn = document.getElementById('doc-btn');
const documentInput = document.getElementById('document-input');
const documentPreview = document.getElementById('document-preview');
const documentName = document.getElementById('document-name');
const removeDocumentBtn = document.getElementById('remove-document');

// Variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let uploadedDocument = null;
let conversationHistory = [];
let isWaitingForResponse = false;
let thinkingIndicator = null;

// Set up marked.js options
marked.setOptions({
    breaks: true,           // Add line breaks
    gfm: true,              // GitHub flavored markdown
    headerIds: false,       // No header IDs
    mangle: false,          // Don't mangle email addresses
    sanitize: false,        // Don't sanitize HTML
    smartLists: true,       // Use smarter list behavior
    smartypants: true,      // Use "smart" typographic punctuation
    xhtml: false            // Don't use XHTML-compliant tags
});

// Process markdown with special handling for asterisks patterns
function processMarkdown(text) {
    // Pre-processing for special asterisk patterns like ***Text:**
    text = text.replace(/\*\*\*(.*?)\*\*/g, '<span class="asterisk">***$1**</span>');
    
    // Convert markdown to HTML
    let html = marked.parse(text);
    
    return html;
}

// Add thinking indicator
function showThinking() {
    thinkingIndicator = document.createElement('div');
    thinkingIndicator.className = 'thinking';
    
    const botAvatar = document.createElement('div');
    botAvatar.textContent = '🤖';
    
    const thinkingText = document.createElement('div');
    thinkingText.textContent = 'EduGenius is thinking';
    
    const dotTyping = document.createElement('div');
    dotTyping.className = 'dot-typing';
    
    // Create dots
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dotTyping.appendChild(dot);
    }
    
    thinkingIndicator.appendChild(botAvatar);
    thinkingIndicator.appendChild(thinkingText);
    thinkingIndicator.appendChild(dotTyping);
    
    chatContainer.appendChild(thinkingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Disable input while thinking
    userInput.disabled = true;
    sendBtn.disabled = true;
    micBtn.disabled = true;
    docBtn.disabled = true;
}

// Remove thinking indicator
function hideThinking() {
    if (thinkingIndicator && thinkingIndicator.parentNode) {
        thinkingIndicator.parentNode.removeChild(thinkingIndicator);
        thinkingIndicator = null;
    }
    
    // Enable input after response
    userInput.disabled = false;
    sendBtn.disabled = false;
    micBtn.disabled = false;
    docBtn.disabled = false;
}

// Voice recording functions
async function toggleRecording() {
    if (isWaitingForResponse) return;
    
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            await processAudio(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        micBtn.textContent = '⏹️ Stop';
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access your microphone. Please check permissions.');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        micBtn.textContent = '🎤 Voice';
    }
}

async function processAudio(audioBlob) {
    try {
        showThinking();
        
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.wav');
        
        const response = await fetch('/voice-input', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Audio transcription failed');
        }
        
        hideThinking();
        
        const data = await response.json();
        userInput.value = data.transcription;
    } catch (error) {
        console.error('Error processing audio:', error);
        alert('Failed to process audio recording.');
        hideThinking();
    }
}

// Document functions
function handleDocumentUpload(event) {
    if (isWaitingForResponse) return;
    
    const file = event.target.files[0];
    if (!file) return;
    
    uploadedDocument = file;
    documentName.textContent = file.name;
    documentPreview.style.display = 'block';
}

function removeDocument() {
    if (isWaitingForResponse) return;
    
    uploadedDocument = null;
    documentInput.value = '';
    documentPreview.style.display = 'none';
}

// Chat functions
async function sendMessage() {
    const message = userInput.value.trim();
    if ((!message && !uploadedDocument) || isWaitingForResponse) return;
    
    isWaitingForResponse = true;
    
    // Hide welcome message
    welcome.style.display = 'none';
    
    // Add user message to UI
    addMessage('user', message);
    
    // Add to conversation history
    conversationHistory.push({ role: 'user', content: message });
    
    // Clear input
    userInput.value = '';
    
    // Show thinking indicator
    showThinking();
    
    try {
        let response;
        
        if (uploadedDocument) {
            // Document chat
            const formData = new FormData();
            formData.append('query', message);
            formData.append('file', uploadedDocument);
            
            response = await fetch('/document-chat', {
                method: 'POST',
                body: formData
            });
            
            removeDocument();
        } else {
            // Regular chat with conversation history
            response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: conversationHistory
                })
            });
        }
        
        // Hide thinking indicator
        hideThinking();
        
        if (!response.ok) {
            throw new Error('Failed to get response');
        }
        
        const data = await response.json();
        
        // Add bot response to conversation history
        conversationHistory.push({ role: 'assistant', content: data.response });
        
        // Add bot response to UI with markdown rendering
        addMessage('bot', data.response, data.audio?.audio_content);
    } catch (error) {
        console.error('Error sending message:', error);
        hideThinking();
        addMessage('bot', 'Sorry, I encountered an error. Please try again.');
    } finally {
        isWaitingForResponse = false;
    }
}

function addMessage(role, content, audioContent = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
    
    // Create content element
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // For user messages, just use the plain text
    if (role === 'user') {
        contentDiv.textContent = content;
    } else {
        // For bot messages, render markdown
        contentDiv.innerHTML = processMarkdown(content);
    }
    
    messageDiv.appendChild(contentDiv);
    
    // Add audio button if available
    if (audioContent) {
        const audioBtn = document.createElement('button');
        audioBtn.className = 'play-btn';
        audioBtn.textContent = '🔊 Play Response';
        audioBtn.onclick = function() {
            const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
            audio.play();
            this.disabled = true;
            this.textContent = '🔊 Playing...';
            
            audio.onended = () => {
                this.disabled = false;
                this.textContent = '🔊 Play Response';
            };
        };
        messageDiv.appendChild(audioBtn);
    }
    
    chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

micBtn.addEventListener('click', toggleRecording);

docBtn.addEventListener('click', () => {
    if (!isWaitingForResponse) {
        documentInput.click();
    }
});

documentInput.addEventListener('change', handleDocumentUpload);

removeDocumentBtn.addEventListener('click', removeDocument);