import base64
import uuid
import shutil
from fastapi import UploadFile
from pathlib import Path

def encode_file(file_path):
    """Read a file and encode it to base64"""
    with open(file_path, "rb") as file:
        return base64.b64encode(file.read()).decode('utf-8')

def save_uploaded_file(file: UploadFile, upload_dir: Path) -> str:
    """Save an uploaded file and return its path"""
    file_id = str(uuid.uuid4())
    file_extension = file.filename.split(".")[-1] if "." in file.filename else ""
    file_path = Path(upload_dir) / f"{file_id}.{file_extension}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return str(file_path)