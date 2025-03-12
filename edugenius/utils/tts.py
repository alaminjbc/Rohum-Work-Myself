import base64
import os
import uuid
import gtts
from pathlib import Path

def text_to_speech_gtts(text, audio_dir, lang='en'):
    """Convert text to speech using gTTS"""
    try:
        # Create a unique filename
        audio_file = Path(audio_dir) / f"{uuid.uuid4()}.mp3"
        
        # Generate the audio file
        tts = gtts.gTTS(text=text, lang=lang, slow=False)
        tts.save(str(audio_file))
        
        # Read the file and encode to base64
        with open(audio_file, "rb") as file:
            audio_content = base64.b64encode(file.read()).decode('utf-8')
        
        # Remove the temporary file
        os.remove(audio_file)
        
        return audio_content
    except Exception as e:
        print(f"Error in TTS: {str(e)}")
        return None