import base64
import os
import uuid
from typing import List, Optional
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from openai import OpenAI
from pathlib import Path
import logging
from utils.tts import text_to_speech_gtts
from utils.audio import encode_file, save_uploaded_file

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="EduGenius Chatbot API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment variables
# GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_KEY=""
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

# Initialize OpenAI client for Gemini
client = OpenAI(
    api_key=GEMINI_API_KEY,
    base_url=GEMINI_BASE_URL
)

# Create directories
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

AUDIO_DIR = Path("./audio_temp")
AUDIO_DIR.mkdir(exist_ok=True)

# Models
class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    system_message: Optional[str] = "You are EduGenius, an educational AI assistant designed to help students learn effectively."

# Set up templates and static files
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Routes
@app.get("/")
async def get_root(request: Request):
    """Serve the main HTML page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(request: ChatRequest):
    """Process text chat with the AI and return both text and audio response"""
    try:
        # Start with system message
        messages = [{"role": "system", "content": request.system_message}]
        
        # Add all conversation messages
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        
        response = client.chat.completions.create(
            model="gemini-2.0-flash",
            messages=messages
        )
        
        text_response = response.choices[0].message.content
        
        # Generate speech from the response
        audio_content = text_to_speech_gtts(text_response, AUDIO_DIR)
        
        return {
            "response": text_response,
            "audio": {"audio_content": audio_content, "format": "mp3"},
            "model": "gemini-2.0-flash"
        }
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/voice-input")
async def voice_input(file: UploadFile = File(...)):
    """Process voice input and transcribe it"""
    try:
        # Save the uploaded audio file
        temp_file_path = save_uploaded_file(file, UPLOAD_DIR)
        
        # Encode the audio file
        base64_audio = encode_file(temp_file_path)
        
        # Send to Gemini for transcription
        response = client.chat.completions.create(
            model="gemini-2.0-flash",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Transcribe this audio accurately",
                        },
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": base64_audio,
                                "format": "wav"
                            }
                        }
                    ],
                }
            ],
        )
        
        # Clean up the temporary file
        os.remove(temp_file_path)
        
        return {
            "transcription": response.choices[0].message.content,
            "model": "gemini-2.0-flash"
        }
    except Exception as e:
        logger.error(f"Error in voice input endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/document-chat")
async def document_chat(
    query: str = Form(...),
    file: UploadFile = File(...),
    system_message: str = Form("You are EduGenius, an educational AI assistant. Analyze the document and answer the query accurately.")
):
    """Upload a document and chat about it"""
    try:
        # Save the uploaded document
        document_path = save_uploaded_file(file, UPLOAD_DIR)
        
        # Encode the document
        base64_document = encode_file(document_path)
        
        # Determine content type
        file_extension = file.filename.split(".")[-1].lower()
        content_type = "image/jpeg"  # Default
        
        if file_extension in ["jpg", "jpeg", "png"]:
            content_type = f"image/{file_extension}"
        elif file_extension in ["pdf"]:
            content_type = "application/pdf"
        elif file_extension in ["doc", "docx"]:
            content_type = "application/msword"
        
        # Send to Gemini for document analysis
        response = client.chat.completions.create(
            model="gemini-2.0-flash",
            messages=[
                {
                    "role": "system", 
                    "content": system_message
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": query,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{base64_document}"
                            },
                        },
                    ],
                }
            ],
        )
        
        text_response = response.choices[0].message.content
        
        # Generate speech from the response
        audio_content = text_to_speech_gtts(text_response, AUDIO_DIR)
        
        return {
            "response": text_response,
            "audio": {"audio_content": audio_content, "format": "mp3"},
            "document_id": os.path.basename(document_path),
            "model": "gemini-2.0-flash"
        }
    except Exception as e:
        logger.error(f"Error in document chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Run the application
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)