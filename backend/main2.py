"""
NexusLearn - FastAPI Backend Server
===============================

An AI-powered learning and preparation platform that combines:
- RAG (Retrieval-Augmented Generation) for document Q&A
- Note-taking and PDF annotations
- Reading progress and bookmarks

Tech Stack:
- FastAPI: Modern Python web framework
- Groq API: LLM for text generation and Q&A
- Pinecone: Vector database for semantic search
- MongoDB: Document database for persistent storage
- SentenceTransformers: Local embedding generation


Project: NexusLearn
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import os
import hashlib
import asyncio
from dotenv import load_dotenv
from groq import Groq
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
import PyPDF2
import io
import uuid
from datetime import datetime
import json
import re
import random
from bson import ObjectId
from pathlib import Path

# Import document processors
from processors import (
    PDFProcessor,
    TextProcessor,
    WordProcessor,
    LegacyWordProcessor,
    YouTubeProcessor
)

# Import database collections and initialization function
from database import (
    users_collection,
    notebooks_collection,
    documents_collection,
    chat_history_collection,
    notes_collection,
    annotations_collection,
    analysis_cache_collection,
    pdf_questions_collection,
    reading_progress_collection,
    bookmarks_collection,
    init_db
)

# Import authentication utilities
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    verify_google_token,
    UserCreate,
    UserLogin,
    GoogleAuthRequest,
    Token,
    User,
    TokenData
)

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI application
app = FastAPI(
    title="NexusLearn API",
    description="AI-powered learning and preparation platform",
    version="1.0.0"
)

# File Upload Configuration
# =========================
# Directory where uploaded PDF files are stored
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

# Directory where uploaded images are stored
IMAGES_DIR = Path("uploads/images")
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Application Startup Event
# =========================
@app.on_event("startup")
async def startup_event():
    """
    Initialize application resources on startup.
    - Creates database indexes for optimal query performance
    """
    init_db()
    print("Application started, database initialized")

# CORS Configuration
# ==================
# Enable Cross-Origin Resource Sharing for frontend communication
# Supports both local development and production deployments
# For production, set FRONTEND_URL environment variable to your Vercel URL
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
]

# Add production frontend URL if specified
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Mount static files for image serving
app.mount("/uploads/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

# AI Services Initialization
# ===========================

# Groq LLM Client
# Used for text generation, Q&A, and notes generation
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Sentence Transformer Model
# Converts text to 768-dimensional embeddings for semantic search
# Model: all-mpnet-base-v2 (best quality for semantic similarity)
embedding_model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')

def get_embedding(text: str):
    """Generate embedding for text using the initialized model"""
    try:
        return embedding_model.encode(text).tolist()
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return []

# Pinecone Vector Database
# =========================
# Initialize Pinecone client for storing and searching document embeddings
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index_name = os.getenv("PINECONE_INDEX_NAME", "pdf-rag-index")

# Create Pinecone index if it doesn't exist
# Index stores 768-dimensional vectors with cosine similarity metric
if index_name not in pc.list_indexes().names():
    pc.create_index(
        name=index_name,
        dimension=768,  # Matches all-mpnet-base-v2 embedding dimension
        metric="cosine",  # Cosine similarity for semantic search
        spec=ServerlessSpec(
            cloud="aws",
            region=os.getenv("PINECONE_ENVIRONMENT", "us-east-1")
        )
    )

# Connect to the Pinecone index
index = pc.Index(index_name)

# In-Memory Data Stores
# =====================
# Document metadata cache (supplementary to MongoDB)
documents_store = {}


# ==================== PYDANTIC MODELS ====================
# Data validation and serialization models using Pydantic

# Notebook Models
# ===============
class NotebookCreate(BaseModel):
    """Model for creating a new notebook"""
    name: str  # Notebook name
    color: str = "#2f5bea"  # Notebook theme color (hex)
    icon: str = "📚"  # Notebook icon emoji

class NotebookUpdate(BaseModel):
    """Model for updating an existing notebook"""
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


# Q&A and Chat Models
# ===================
class QuestionRequest(BaseModel):
    """Model for asking a question about documents"""
    question: str  # User's question
    document_ids: Optional[List[str]] = None  # Specific documents to search (None = all)
    notebook_id: str  # Notebook context

class ChatMessage(BaseModel):
    """Model for a single chat message"""
    role: str  # 'user' or 'assistant'
    content: str  # Message text

class ChatHistorySave(BaseModel):
    """Model for saving chat conversation history"""
    notebook_id: str
    messages: List[ChatMessage]


# Notes Models
# ============
class NoteCreate(BaseModel):
    """Model for creating a new note"""
    notebook_id: str
    title: str
    content: str  # Can be text, HTML, JSON for drawing, or structured data
    note_type: str = "text"  # text, rich_text, drawing, ai_mindmap, ai_flashcards, ai_timeline
    color: str = "#ffffff"  # Note background color
    tags: Optional[List[str]] = []  # Organizational tags

class NoteUpdate(BaseModel):
    """Model for updating an existing note"""
    title: Optional[str] = None
    content: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[List[str]] = None

class NoteGenerateRequest(BaseModel):
    """Model for AI-generating notes from documents"""
    notebook_id: str
    document_ids: Optional[List[str]] = None
    topic: Optional[str] = None  # If provided, generates notes on this topic
    note_type: str = "summary"  # summary, key_points, mind_map, flashcards, timeline, comparison_table


# Annotation Models
# =================
class AnnotationCreate(BaseModel):
    """Model for creating annotations (text highlight or video timestamp)"""
    notebook_id: str
    document_id: str  # Document being annotated
    annotation_type: str = "highlight"  # "highlight" for text, "timestamp" for video, "both" for video with text

    # For text/PDF annotations
    page_number: Optional[int] = None  # Page number (0-indexed, for PDFs)
    highlighted_text: Optional[str] = None  # Text that was highlighted
    position: Optional[dict] = None  # Position data: {x, y, width, height}

    # For video timestamp annotations
    timestamp_start: Optional[float] = None  # Start timestamp in seconds
    timestamp_end: Optional[float] = None  # End timestamp in seconds (optional)

    # Common fields
    color: str = "#ffeb3b"  # Highlight color
    note: Optional[str] = None  # Optional annotation note

class AnnotationQueryRequest(BaseModel):
    """Model for asking questions about a specific annotation"""
    annotation_id: str
    question: str
    context: Optional[str] = None  # Context text (transcript or highlighted text)


class YouTubeURLSubmit(BaseModel):
    """Model for submitting YouTube URLs"""
    url: str
    custom_title: Optional[str] = None


# Document Analysis Models
# =========================
class DocumentAnalyzeRequest(BaseModel):
    """Model for requesting document analysis"""
    question_types: List[str] = ["2-marks", "5-marks", "10-marks"]  # Types of questions to generate


# ==================== READING PROGRESS & BOOKMARKS MODELS ====================

class ReadingProgressUpdate(BaseModel):
    """Model for updating reading progress"""
    document_id: str
    notebook_id: str
    current_page: int
    total_pages: int
    time_spent_seconds: Optional[int] = 0
    mark_completed: Optional[bool] = False  # Mark current page as completed

class BookmarkCreate(BaseModel):
    """Model for creating a bookmark"""
    notebook_id: str
    document_id: str
    page_number: int
    title: Optional[str] = None
    note: Optional[str] = None

class BookmarkUpdate(BaseModel):
    """Model for updating a bookmark"""
    title: Optional[str] = None
    note: Optional[str] = None


# ==================== HELPER FUNCTIONS ====================

def extract_text_from_pdf(pdf_file):
    """
    Extract all text content from a PDF file.

    Args:
        pdf_file: File-like object or path to PDF

    Returns:
        str: Concatenated text from all pages
    """
    pdf_reader = PyPDF2.PdfReader(pdf_file)
    text = ""
    for page in pdf_reader.pages:
        text += page.extract_text()
    return text


def chunk_text(text, chunk_size=1000, overlap=200):
    """
    Split text into overlapping chunks for better context retention.

    Overlapping ensures that context at chunk boundaries is not lost,
    improving the quality of semantic search results.

    Args:
        text: Input text to chunk
        chunk_size: Maximum characters per chunk (default: 1000)
        overlap: Number of overlapping characters between chunks (default: 200)

    Returns:
        List[str]: List of text chunks
    """
    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += chunk_size - overlap

    return chunks


def get_embedding(text):
    """
    Convert text to 768-dimensional embedding vector.

    Uses SentenceTransformer model (all-mpnet-base-v2) to generate
    embeddings for semantic similarity search.

    Args:
        text: Input text to embed

    Returns:
        List[float]: 768-dimensional embedding vector, or None on error
    """
    try:
        embedding = embedding_model.encode(text)
        return embedding.tolist()
    except Exception as e:
        print(f"Error getting embedding: {e}")
        return None


def get_file_processor(filename: str):
    """
    Get the appropriate document processor based on file extension

    Args:
        filename: Name of the file with extension

    Returns:
        Instance of the appropriate processor class

    Raises:
        ValueError: If file type is not supported
    """
    extension = filename.lower().split('.')[-1]

    if extension == 'pdf':
        return PDFProcessor()
    elif extension == 'txt':
        return TextProcessor('txt')
    elif extension == 'md':
        return TextProcessor('md')
    elif extension == 'rtf':
        return TextProcessor('rtf')
    elif extension == 'docx':
        return WordProcessor()
    elif extension == 'doc':
        return LegacyWordProcessor()
    else:
        raise ValueError(f"Unsupported file type: {extension}")


async def ensure_document_chunks(doc: dict) -> List[str]:
    """
    Ensure a document has text chunks, regenerating from PDF if needed.

    This function checks if a document has pre-cached chunks in the database.
    If not, it re-extracts text from the PDF and chunks it.

    Args:
        doc: Document dictionary from MongoDB

    Returns:
        List[str]: List of text chunks
    """
    chunks = doc.get("chunks") or []

    if chunks:
        return chunks

    # Try to resolve the PDF path
    pdf_path = doc.get("file_path")
    if not pdf_path:
        notebook_id = doc.get("notebook_id")
        doc_id = doc.get("doc_id")
        if notebook_id and doc_id:
            pdf_path = UPLOADS_DIR / notebook_id / f"{doc_id}.pdf"
    else:
        pdf_path = Path(pdf_path)

    if not pdf_path or not Path(pdf_path).exists():
        print(f"Unable to locate PDF for document {doc.get('doc_id')}")
        return []

    try:
        with open(pdf_path, "rb") as pdf_file:
            text = extract_text_from_pdf(pdf_file)
    except Exception as e:
        print(f"Error re-extracting text for document {doc.get('doc_id')}: {e}")
        return []

    chunks = chunk_text(text)

    if not chunks:
        return []

    # Persist chunks for future calls (best effort)
    try:
        update_fields = {"chunks": chunks, "chunks_count": len(chunks)}
        doc_id = doc.get("_id")
        if doc_id:
            await documents_collection.update_one({"_id": doc_id}, {"$set": update_fields})
    except Exception as e:
        print(f"Error caching chunks for document {doc.get('doc_id')}: {e}")

    return chunks


def notebook_helper(notebook) -> dict:
    """
    Convert MongoDB notebook document to API response format.

    Transforms ObjectId to string and provides default values for optional fields.

    Args:
        notebook: MongoDB notebook document

    Returns:
        dict: Formatted notebook data for API response
    """
    return {
        "id": str(notebook["_id"]),
        "name": notebook["name"],
        "color": notebook.get("color", "#2f5bea"),
        "icon": notebook.get("icon", "📚"),
        "created_at": notebook["created_at"],
        "document_count": notebook.get("document_count", 0)
    }


# ==================== PDF ANALYSIS HELPER FUNCTIONS ====================

def extract_pdf_pages(pdf_path: str):
    """
    Extract text from PDF page by page.

    Args:
        pdf_path: Path to the PDF file

    Yields:
        Tuple[int, str]: (page_number, page_text) for each page
    """
    try:
        with open(pdf_path, "rb") as pdf_file:
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            total_pages = len(pdf_reader.pages)

            for page_num in range(total_pages):
                page = pdf_reader.pages[page_num]
                page_text = page.extract_text() or ""

                # Clean up text - remove excessive whitespace
                page_text = " ".join(page_text.split())

                # Limit to 2000 chars to minimize token usage
                if len(page_text) > 2000:
                    page_text = page_text[:2000]

                yield (page_num + 1, page_text, total_pages)  # 1-indexed page numbers

    except Exception as e:
        print(f"Error extracting PDF pages: {e}")
        raise


def build_analysis_prompt(page_text: str, question_types: List[str] = None) -> str:
    """
    Build prompt for generating study questions from PDF content.

    Args:
        page_text: Text content of the page
        question_types: List of question types to generate

    Returns:
        str: Formatted prompt for Groq API
    """
    question_types = question_types or ["2-marks", "5-marks", "10-marks"]

    prompt = f"""Analyze this educational content and generate important exam questions.

Generate questions that test understanding of this content:
{"- 1 x 2-mark question (definition/recall based)" if "2-marks" in question_types else ""}
{"- 1 x 5-mark question (explanation/application based)" if "5-marks" in question_types else ""}
{"- 1 x 10-mark question (analysis/comprehensive)" if "10-marks" in question_types else ""}

For each question provide:
- type: Question mark type (2-marks, 5-marks, or 10-marks)
- question: The actual question
- answer: Brief answer (2-3 sentences for 2m, 4-5 sentences for 5m, paragraph for 10m)
- answer_text_snippet: Exact text from content that contains the answer (for highlighting)

Content:
{page_text}

Respond ONLY with valid JSON (no markdown, no code blocks):
{{
  "questions": [
    {{
      "type": "2-marks",
      "question": "...",
      "answer": "...",
      "answer_text_snippet": "exact text from content containing the answer"
    }}
  ]
}}"""

    return prompt


async def analyze_page_with_groq(page_text: str, question_types: List[str]) -> dict:
    """
    Analyze a single page using Groq API to generate study questions.

    Args:
        page_text: Text content of the page
        question_types: List of question types to generate

    Returns:
        dict: Analysis result with questions
    """
    try:
        prompt = build_analysis_prompt(page_text, question_types)

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert educational content analyzer. Always respond with valid JSON only."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=1500
        )

        response_text = chat_completion.choices[0].message.content.strip()

        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        result = json.loads(response_text)
        return result

    except json.JSONDecodeError as e:
        print(f"Error parsing JSON from Groq: {e}")
        print(f"Response was: {response_text}")
        return {"questions": []}
    except Exception as e:
        print(f"Error analyzing page with Groq: {e}")
        return {"questions": []}


async def get_cached_analysis(doc_id: str, page_number: int) -> Optional[dict]:
    """
    Retrieve cached analysis result.

    Args:
        doc_id: Document ID
        page_number: Page number

    Returns:
        dict: Cached result or None
    """
    try:
        query = {
            "document_id": doc_id,
            "page_number": page_number
        }

        cached = await analysis_cache_collection.find_one(query)
        return cached.get("result") if cached else None

    except Exception as e:
        print(f"Error retrieving cached analysis: {e}")
        return None


async def cache_analysis(doc_id: str, page_number: int, result: dict):
    """
    Cache analysis result for future use.

    Args:
        doc_id: Document ID
        page_number: Page number
        result: Analysis result to cache
    """
    try:
        cache_doc = {
            "document_id": doc_id,
            "page_number": page_number,
            "result": result,
            "created_at": datetime.now().isoformat()
        }

        await analysis_cache_collection.update_one(
            {
                "document_id": doc_id,
                "page_number": page_number
            },
            {"$set": cache_doc},
            upsert=True
        )
    except Exception as e:
        print(f"Error caching analysis: {e}")


# ==================== API ENDPOINTS ====================

@app.get("/")
def read_root():
    """Health check endpoint"""
    return {"message": "RAG API is running"}


# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    """Register a new user with email and password"""
    try:
        # Check if user already exists
        existing_user = await users_collection.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Email already registered"
            )

        # Hash password
        hashed_password = get_password_hash(user_data.password)

        # Create user document
        user_doc = {
            "name": user_data.name,
            "email": user_data.email,
            "password": hashed_password,
            "auth_provider": "local",
            "created_at": datetime.utcnow()
        }

        # Insert user into database
        result = await users_collection.insert_one(user_doc)
        user_id = str(result.inserted_id)

        # Create access token
        access_token = create_access_token(
            data={"sub": user_data.email, "user_id": user_id}
        )

        return {"access_token": access_token, "token_type": "bearer"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """Login with email and password"""
    try:
        # Find user by email
        user = await users_collection.find_one({"email": user_data.email})

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Incorrect email or password"
            )

        # Verify password
        if not verify_password(user_data.password, user["password"]):
            raise HTTPException(
                status_code=401,
                detail="Incorrect email or password"
            )

        # Create access token
        access_token = create_access_token(
            data={"sub": user["email"], "user_id": str(user["_id"])}
        )

        return {"access_token": access_token, "token_type": "bearer"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/auth/google", response_model=Token)
async def google_auth(auth_data: GoogleAuthRequest):
    """Authenticate with Google OAuth token"""
    try:
        # Verify Google token and get user info
        google_user = verify_google_token(auth_data.token)

        # Check if user exists
        user = await users_collection.find_one({"email": google_user["email"]})

        if not user:
            # Create new user
            user_doc = {
                "name": google_user["name"],
                "email": google_user["email"],
                "google_id": google_user["google_id"],
                "auth_provider": "google",
                "created_at": datetime.utcnow()
            }
            result = await users_collection.insert_one(user_doc)
            user_id = str(result.inserted_id)
        else:
            user_id = str(user["_id"])

        # Create access token
        access_token = create_access_token(
            data={"sub": google_user["email"], "user_id": user_id}
        )

        return {"access_token": access_token, "token_type": "bearer"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/auth/me", response_model=User)
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """Get current user information"""
    try:
        user = await users_collection.find_one({"_id": ObjectId(current_user.user_id)})

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
            "auth_provider": user.get("auth_provider", "local")
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== NOTEBOOK ENDPOINTS ====================

@app.post("/notebooks")
async def create_notebook(notebook: NotebookCreate, current_user: TokenData = Depends(get_current_user)):
    """
    Create a new notebook.

    Notebooks are the primary organizational unit, containing documents,
    notes, quizzes, and chat history.
    """
    try:
        notebook_data = {
            "user_id": current_user.user_id,
            "name": notebook.name,
            "color": notebook.color,
            "icon": notebook.icon,
            "created_at": datetime.now().isoformat(),
            "document_count": 0
        }

        result = await notebooks_collection.insert_one(notebook_data)
        notebook_data["_id"] = result.inserted_id

        return notebook_helper(notebook_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/notebooks")
async def get_notebooks(current_user: TokenData = Depends(get_current_user)):
    """Get all notebooks for the current user"""
    try:
        notebooks = []
        async for notebook in notebooks_collection.find({"user_id": current_user.user_id}).sort("created_at", -1):
            # Count documents for this notebook
            doc_count = await documents_collection.count_documents({"notebook_id": str(notebook["_id"])})
            notebook["document_count"] = doc_count
            notebooks.append(notebook_helper(notebook))

        return {"notebooks": notebooks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/notebooks/{notebook_id}")
async def get_notebook(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get a specific notebook"""
    try:
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        doc_count = await documents_collection.count_documents({"notebook_id": notebook_id})
        notebook["document_count"] = doc_count

        return notebook_helper(notebook)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/notebooks/{notebook_id}")
async def update_notebook(notebook_id: str, notebook_update: NotebookUpdate, current_user: TokenData = Depends(get_current_user)):
    """Update a notebook"""
    try:
        update_data = {}
        if notebook_update.name is not None:
            update_data["name"] = notebook_update.name
        if notebook_update.color is not None:
            update_data["color"] = notebook_update.color
        if notebook_update.icon is not None:
            update_data["icon"] = notebook_update.icon

        if not update_data:
            raise HTTPException(status_code=400, detail="No update data provided")

        result = await notebooks_collection.update_one(
            {"_id": ObjectId(notebook_id), "user_id": current_user.user_id},
            {"$set": update_data}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notebook not found")

        updated_notebook = await notebooks_collection.find_one({"_id": ObjectId(notebook_id)})
        doc_count = await documents_collection.count_documents({"notebook_id": notebook_id})
        updated_notebook["document_count"] = doc_count

        return notebook_helper(updated_notebook)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Delete a notebook and all its documents"""
    try:
        # Verify ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Delete all documents associated with this notebook
        await documents_collection.delete_many({"notebook_id": notebook_id})

        # Delete from Pinecone (all vectors with this notebook metadata)
        try:
            index.delete(filter={"notebook_id": notebook_id})
        except:
            pass  # Pinecone might not have any vectors

        # Delete the notebook
        result = await notebooks_collection.delete_one({"_id": ObjectId(notebook_id)})

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Notebook not found")

        return {"message": "Notebook deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload-pdfs/{notebook_id}")
async def upload_pdfs(notebook_id: str, files: List[UploadFile] = File(...)):
    """Upload and process multiple PDF files for a notebook"""
    try:
        # Verify notebook exists
        notebook = await notebooks_collection.find_one({"_id": ObjectId(notebook_id)})
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        uploaded_docs = []

        # Create notebook directory if it doesn't exist
        notebook_dir = UPLOADS_DIR / notebook_id
        notebook_dir.mkdir(exist_ok=True)

        for file in files:
            if not file.filename.endswith('.pdf'):
                raise HTTPException(status_code=400, detail=f"{file.filename} is not a PDF file")

            # Read PDF content
            content = await file.read()
            pdf_file = io.BytesIO(content)

            # Extract text
            text = extract_text_from_pdf(pdf_file)

            # Create chunks
            chunks = chunk_text(text)

            # Generate document ID
            doc_id = str(uuid.uuid4())

            # Save PDF file to disk
            pdf_path = notebook_dir / f"{doc_id}.pdf"
            with open(pdf_path, "wb") as f:
                f.write(content)

            # Store document metadata in MongoDB
            doc_data = {
                "doc_id": doc_id,
                "notebook_id": notebook_id,
                "filename": file.filename,
                "uploaded_at": datetime.now().isoformat(),
                "chunks_count": len(chunks),
                "chunks": chunks,
                "file_path": str(pdf_path)
            }
            await documents_collection.insert_one(doc_data)

            # Process and store chunks in Pinecone
            vectors = []
            for i, chunk in enumerate(chunks):
                embedding = get_embedding(chunk)
                if embedding:
                    vectors.append({
                        "id": f"{doc_id}_{i}",
                        "values": embedding,
                        "metadata": {
                            "doc_id": doc_id,
                            "notebook_id": notebook_id,
                            "filename": file.filename,
                            "chunk_index": i,
                            "text": chunk
                        }
                    })

            # Upsert to Pinecone in batches
            batch_size = 100
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                index.upsert(vectors=batch)

            uploaded_docs.append({
                "id": doc_id,
                "filename": file.filename,
                "uploaded_at": doc_data["uploaded_at"],
                "chunks_count": len(chunks)
            })

        # Update notebook document count
        await notebooks_collection.update_one(
            {"_id": ObjectId(notebook_id)},
            {"$inc": {"document_count": len(files)}}
        )

        return {
            "message": f"Successfully uploaded {len(files)} PDF(s)",
            "documents": uploaded_docs
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload-documents/{notebook_id}")
async def upload_documents(notebook_id: str, files: List[UploadFile] = File(...), current_user: TokenData = Depends(get_current_user)):
    """Upload and process multiple documents (PDF, TXT, MD, RTF, DOCX, DOC) for a notebook"""
    try:
        # Verify notebook exists and user owns it
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        uploaded_docs = []
        supported_extensions = ['.pdf', '.txt', '.md', '.rtf', '.docx', '.doc']

        # Create notebook directory if it doesn't exist
        notebook_dir = UPLOADS_DIR / notebook_id
        notebook_dir.mkdir(exist_ok=True)

        for file in files:
            # Check if file type is supported
            file_ext = os.path.splitext(file.filename)[1].lower()
            if file_ext not in supported_extensions:
                raise HTTPException(
                    status_code=400,
                    detail=f"{file.filename} has unsupported file type. Supported: {', '.join(supported_extensions)}"
                )

            try:
                # Get appropriate processor
                processor = get_file_processor(file.filename)
                file_type = processor.get_file_type()

                # Read file content
                content = await file.read()
                file_obj = io.BytesIO(content)

                # Get metadata first
                metadata = processor.get_metadata(file_obj)

                # Extract text - use page-based extraction for PDFs
                file_obj.seek(0)
                chunks = []
                chunks_with_pages = []  # List of (chunk_text, page_number) tuples

                if file_type == "pdf" and hasattr(processor, 'extract_text_with_pages'):
                    # Use page-based extraction for PDFs
                    pages_data = processor.extract_text_with_pages(file_obj)

                    # Chunk each page separately while tracking page numbers
                    for page_num, page_text in pages_data:
                        page_chunks = processor.chunk_text(page_text)
                        for chunk in page_chunks:
                            chunks.append(chunk)
                            chunks_with_pages.append((chunk, page_num))
                else:
                    # For non-PDF files, use standard extraction
                    file_obj.seek(0)
                    text = processor.extract_text(file_obj)
                    chunks = processor.chunk_text(text)
                    # No page tracking for non-PDF files
                    chunks_with_pages = [(chunk, None) for chunk in chunks]

                # Generate document ID
                doc_id = str(uuid.uuid4())

                # Save file to disk
                file_path = notebook_dir / f"{doc_id}{file_ext}"
                with open(file_path, "wb") as f:
                    f.write(content)

                # Add total_pages to metadata for easy access
                total_pages = metadata.get("num_pages", 0)

                # Store document metadata in MongoDB
                doc_data = {
                    "doc_id": doc_id,
                    "notebook_id": notebook_id,
                    "filename": file.filename,
                    "file_type": file_type,
                    "uploaded_at": datetime.now().isoformat(),
                    "chunks_count": len(chunks),
                    "chunks": chunks,
                    "file_path": str(file_path),
                    "total_pages": total_pages,  # Store total pages for quick access
                    "metadata": metadata
                }
                await documents_collection.insert_one(doc_data)

                # Process and store chunks in Pinecone with page tracking
                vectors = []
                for i, (chunk, page_num) in enumerate(chunks_with_pages):
                    embedding = get_embedding(chunk)
                    if embedding:
                        vector_metadata = {
                            "doc_id": doc_id,
                            "notebook_id": notebook_id,
                            "filename": file.filename,
                            "file_type": file_type,
                            "chunk_index": i,
                            "text": chunk
                        }
                        # Add page_number only for PDFs
                        if page_num is not None:
                            vector_metadata["page_number"] = page_num

                        vectors.append({
                            "id": f"{doc_id}_{i}",
                            "values": embedding,
                            "metadata": vector_metadata
                        })

                # Upsert to Pinecone in batches
                batch_size = 100
                for i in range(0, len(vectors), batch_size):
                    batch = vectors[i:i + batch_size]
                    index.upsert(vectors=batch)

                uploaded_docs.append({
                    "id": doc_id,
                    "filename": file.filename,
                    "file_type": file_type,
                    "uploaded_at": doc_data["uploaded_at"],
                    "chunks_count": len(chunks)
                })

            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error processing {file.filename}: {str(e)}")

        # Update notebook document count
        await notebooks_collection.update_one(
            {"_id": ObjectId(notebook_id)},
            {"$inc": {"document_count": len(files)}}
        )

        return {
            "message": f"Successfully uploaded {len(files)} document(s)",
            "documents": uploaded_docs
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/add-youtube/{notebook_id}")
async def add_youtube_video(notebook_id: str, video_data: YouTubeURLSubmit, current_user: TokenData = Depends(get_current_user)):
    """Add a YouTube video to a notebook by URL"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Initialize YouTube processor
        processor = YouTubeProcessor()

        try:
            # Extract transcript and metadata
            text = processor.extract_text(video_data.url)
            metadata = processor.get_metadata(video_data.url)
            transcript_data = processor.get_transcript_with_timestamps()

            # Create chunks
            chunks = processor.chunk_text(text)

            # Generate document ID
            doc_id = str(uuid.uuid4())

            # Use custom title if provided, otherwise use video title from metadata
            filename = video_data.custom_title or metadata.get("title", "YouTube Video")

            # Store document metadata in MongoDB
            doc_data = {
                "doc_id": doc_id,
                "notebook_id": notebook_id,
                "filename": filename,
                "file_type": "youtube",
                "source_url": video_data.url,
                "video_id": metadata.get("video_id", ""),
                "duration": metadata.get("duration", 0),
                "transcript": transcript_data,  # Store full transcript with timestamps
                "uploaded_at": datetime.now().isoformat(),
                "chunks_count": len(chunks),
                "chunks": chunks,
                "metadata": metadata
            }
            await documents_collection.insert_one(doc_data)

            # Process and store chunks in Pinecone
            vectors = []
            for i, chunk in enumerate(chunks):
                embedding = get_embedding(chunk)
                if embedding:
                    vectors.append({
                        "id": f"{doc_id}_{i}",
                        "values": embedding,
                        "metadata": {
                            "doc_id": doc_id,
                            "notebook_id": notebook_id,
                            "filename": filename,
                            "file_type": "youtube",
                            "chunk_index": i,
                            "text": chunk
                        }
                    })

            # Upsert to Pinecone in batches
            batch_size = 100
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                index.upsert(vectors=batch)

            # Update notebook document count
            await notebooks_collection.update_one(
                {"_id": ObjectId(notebook_id)},
                {"$inc": {"document_count": 1}}
            )

            return {
                "message": "Successfully added YouTube video",
                "document": {
                    "id": doc_id,
                    "filename": filename,
                    "file_type": "youtube",
                    "source_url": video_data.url,
                    "duration": metadata.get("duration", 0),
                    "uploaded_at": doc_data["uploaded_at"],
                    "chunks_count": len(chunks)
                }
            }

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error processing YouTube video: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...), current_user: TokenData = Depends(get_current_user)):
    """Upload an image for use in rich text notes"""
    try:
        # Validate file type
        allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
        file_ext = os.path.splitext(file.filename)[1].lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
            )

        # Generate unique filename
        image_id = str(uuid.uuid4())
        filename = f"{image_id}{file_ext}"
        file_path = IMAGES_DIR / filename

        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Return URL for the uploaded image
        image_url = f"http://localhost:8000/uploads/images/{filename}"

        return {
            "success": True,
            "url": image_url,
            "filename": filename
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading image: {str(e)}")


@app.get("/documents/{notebook_id}")
async def get_documents(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get list of uploaded documents for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        documents = []
        async for doc in documents_collection.find({"notebook_id": notebook_id}).sort("uploaded_at", -1):
            doc_info = {
                "id": doc["doc_id"],
                "filename": doc["filename"],
                "uploaded_at": doc["uploaded_at"],
                "chunks_count": doc["chunks_count"],
                "file_type": doc.get("file_type", "pdf")  # Default to pdf for old documents
            }

            # Add YouTube-specific fields if applicable
            if doc.get("file_type") == "youtube":
                doc_info["source_url"] = doc.get("source_url", "")
                doc_info["duration"] = doc.get("duration", 0)

            documents.append(doc_info)
        return {"documents": documents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents/{notebook_id}/{doc_id}/pdf")
async def get_pdf(notebook_id: str, doc_id: str):
    """Serve PDF file"""
    try:
        # Find the document
        doc = await documents_collection.find_one({"doc_id": doc_id, "notebook_id": notebook_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Get the PDF file path
        if "file_path" in doc:
            pdf_path = Path(doc["file_path"])
        else:
            # Fallback for old documents
            pdf_path = UPLOADS_DIR / notebook_id / f"{doc_id}.pdf"

        print(f"Attempting to serve PDF from: {pdf_path.absolute()}")

        if not pdf_path.exists():
            print(f"PDF file not found at: {pdf_path.absolute()}")
            raise HTTPException(status_code=404, detail=f"PDF file not found on disk: {pdf_path.name}")

        return FileResponse(
            path=str(pdf_path.absolute()),
            media_type="application/pdf",
            filename=doc["filename"],
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET",
                "Access-Control-Allow-Headers": "*",
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error serving PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents/{notebook_id}/{doc_id}/content")
async def get_document_content(notebook_id: str, doc_id: str):
    """Get document content (for text-based files) or metadata (for videos)"""
    try:
        # Find the document
        doc = await documents_collection.find_one({"doc_id": doc_id, "notebook_id": notebook_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        file_type = doc.get("file_type", "pdf")

        if file_type == "youtube":
            # For YouTube, return video metadata and transcript
            return {
                "file_type": "youtube",
                "source_url": doc.get("source_url", ""),
                "video_id": doc.get("video_id", ""),
                "duration": doc.get("duration", 0),
                "transcript": doc.get("transcript", []),
                "filename": doc.get("filename", ""),
                "metadata": doc.get("metadata", {})
            }
        elif file_type in ["txt", "md", "rtf", "docx", "doc"]:
            # For text-based documents, serve the file
            if "file_path" in doc:
                file_path = Path(doc["file_path"])
            else:
                # Try to find the file
                notebook_dir = UPLOADS_DIR / notebook_id
                possible_extensions = ['.txt', '.md', '.rtf', '.docx', '.doc']
                file_path = None
                for ext in possible_extensions:
                    test_path = notebook_dir / f"{doc_id}{ext}"
                    if test_path.exists():
                        file_path = test_path
                        break

            if not file_path or not file_path.exists():
                raise HTTPException(status_code=404, detail="Document file not found")

            # Determine media type
            media_types = {
                '.txt': 'text/plain',
                '.md': 'text/markdown',
                '.rtf': 'application/rtf',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.doc': 'application/msword'
            }
            file_ext = file_path.suffix.lower()
            media_type = media_types.get(file_ext, 'application/octet-stream')

            return FileResponse(
                path=str(file_path.absolute()),
                media_type=media_type,
                filename=doc["filename"],
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET",
                    "Access-Control-Allow-Headers": "*",
                }
            )
        elif file_type == "pdf":
            # For PDFs, redirect to PDF endpoint
            raise HTTPException(status_code=400, detail="Use /pdf endpoint for PDF files")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_type}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents/{notebook_id}/{doc_id}/metadata")
async def get_document_metadata(notebook_id: str, doc_id: str):
    """Get detailed document metadata"""
    try:
        # Find the document
        doc = await documents_collection.find_one({"doc_id": doc_id, "notebook_id": notebook_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Build response
        response = {
            "doc_id": doc_id,
            "notebook_id": notebook_id,
            "filename": doc.get("filename", ""),
            "file_type": doc.get("file_type", "pdf"),
            "uploaded_at": doc.get("uploaded_at", ""),
            "chunks_count": doc.get("chunks_count", 0)
        }

        # Add type-specific fields
        if doc.get("file_type") == "youtube":
            response["source_url"] = doc.get("source_url", "")
            response["video_id"] = doc.get("video_id", "")
            response["duration"] = doc.get("duration", 0)
            response["has_transcript"] = len(doc.get("transcript", [])) > 0

        if "file_path" in doc:
            response["file_path"] = doc["file_path"]

        if "metadata" in doc:
            response["metadata"] = doc["metadata"]

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: TokenData = Depends(get_current_user)):
    """Delete a document and its vectors"""
    try:
        # Find the document
        doc = await documents_collection.find_one({"doc_id": doc_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        notebook_id = doc["notebook_id"]

        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        # Delete the PDF file from disk
        if "file_path" in doc:
            pdf_path = Path(doc["file_path"])
            if pdf_path.exists():
                pdf_path.unlink()

        # Delete vectors from Pinecone
        try:
            index.delete(filter={"doc_id": doc_id})
        except:
            pass

        # Remove from MongoDB
        await documents_collection.delete_one({"doc_id": doc_id})

        # Update notebook document count
        await notebooks_collection.update_one(
            {"_id": ObjectId(notebook_id)},
            {"$inc": {"document_count": -1}}
        )

        return {"message": "Document deleted successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/validate-document/{doc_id}")
async def validate_document(doc_id: str, current_user: TokenData = Depends(get_current_user)):
    """Validate a document for potential issues and quality problems"""
    try:
        # Find the document
        doc = await documents_collection.find_one({"doc_id": doc_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        notebook_id = doc["notebook_id"]

        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        # Only support PDF for validation
        if doc.get("file_type") != "pdf":
            return {
                "issues": [],
                "message": "Validation is currently only supported for PDF documents"
            }

        # Get the document content from vectors
        # Use the correct embedding dimension (768 for all-mpnet-base-v2)
        results = index.query(
            vector=[0.0] * 768,  # Dummy vector with correct dimension
            filter={"doc_id": doc_id},
            top_k=10000,
            include_metadata=True
        )

        if not results.matches:
            return {
                "issues": [{
                    "type": "No Content",
                    "description": "No content found in document. The document may be empty or failed to process.",
                    "severity": "high",
                    "location": "Document"
                }]
            }

        # Collect all text chunks
        all_chunks = [match.metadata.get('text', '') for match in results.matches]
        total_text = " ".join(all_chunks)

        # Analyze with AI
        validation_prompt = f"""Analyze the following document content and identify potential issues. Perform both TECHNICAL and CONTENT validation:

TECHNICAL VALIDATION - Look for:
1. OCR errors (garbled text, unusual characters, repeated characters)
2. Formatting issues (missing spaces, broken sentences, improper line breaks)
3. Incomplete content (truncated sentences, missing sections)
4. Data quality problems (inconsistent formatting, unusual patterns)
5. Readability issues (very short fragments, incomprehensible text)

CONTENT VALIDATION - Look for:
1. Factual accuracy issues (incorrect information, outdated facts, misleading statements)
2. Logical inconsistencies (contradictions, flawed reasoning, unsupported claims)
3. Missing context (incomplete explanations, undefined terms, missing prerequisites)
4. Poor structure (disorganized content, unclear progression, missing transitions)
5. Educational quality (overly vague explanations, missing examples, inadequate depth)
6. Bias or misleading content (one-sided views, unsubstantiated opinions presented as facts)
7. Citation or reference issues (missing sources for claims, unreferenced data)

Document content sample (first 5000 characters):
{total_text[:5000]}

Total document length: {len(total_text)} characters
Number of chunks: {len(all_chunks)}

Return a JSON array of issues found. Each issue should have:
- type: Brief category name (e.g., "OCR Error", "Factual Inaccuracy", "Missing Context", "Poor Structure")
- description: Detailed description of the issue with specific examples if possible
- severity: "high" (critical issues affecting understanding/accuracy), "medium" (notable issues that should be addressed), or "low" (minor issues)
- location: Where the issue was found (e.g., "Throughout document", "Beginning section", "Mathematical formulas")

If NO issues are found, return an empty array: []

IMPORTANT: Return ONLY the JSON array, no additional text."""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a document quality validator. Respond with ONLY valid JSON arrays."
                },
                {
                    "role": "user",
                    "content": validation_prompt
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=3000
        )

        response_text = chat_completion.choices[0].message.content.strip()

        # Extract JSON from response
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            response_text = json_match.group()

        try:
            issues = json.loads(response_text)
            if not isinstance(issues, list):
                issues = []
        except json.JSONDecodeError:
            # If parsing fails, return no issues
            issues = []

        return {
            "issues": issues,
            "total_chunks": len(all_chunks),
            "total_characters": len(total_text)
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error validating document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/documents/{notebook_id}/{doc_id}/analyze")
async def analyze_document(
    notebook_id: str,
    doc_id: str,
    request: DocumentAnalyzeRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    Analyze a PDF document to generate study questions.
    Returns all questions after processing the entire document.
    """
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Find the document
        doc = await documents_collection.find_one({
            "doc_id": doc_id,
            "notebook_id": notebook_id
        })
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Only support PDF for now
        if doc.get("file_type") != "pdf":
            raise HTTPException(status_code=400, detail="Only PDF documents are supported for analysis")

        # Get PDF file path
        if "file_path" in doc:
            pdf_path = Path(doc["file_path"])
        else:
            pdf_path = UPLOADS_DIR / notebook_id / f"{doc_id}.pdf"

        if not pdf_path.exists():
            raise HTTPException(status_code=404, detail="PDF file not found on disk")

        all_questions = []

        # Process each page
        for page_num, page_text, total_pages in extract_pdf_pages(str(pdf_path)):
            # Check cache first
            cached_result = await get_cached_analysis(doc_id, page_num)

            if cached_result:
                result = cached_result
            else:
                # Analyze with Groq
                result = await analyze_page_with_groq(page_text, request.question_types)

                # Cache the result
                await cache_analysis(doc_id, page_num, result)

            # Add questions from this page
            for q in result.get("questions", []):
                question_doc = {
                    "notebook_id": notebook_id,
                    "document_id": doc_id,
                    "type": q.get("type", "2-marks"),
                    "question": q.get("question", ""),
                    "answer": q.get("answer", ""),
                    "answer_text_snippet": q.get("answer_text_snippet", ""),
                    "page": page_num,
                    "created_at": datetime.now().isoformat()
                }

                # Save to database
                question_result = await pdf_questions_collection.insert_one(question_doc)

                # Add to response with ID
                all_questions.append({
                    "id": str(question_result.inserted_id),
                    "type": question_doc["type"],
                    "question": question_doc["question"],
                    "answer": question_doc["answer"],
                    "answer_text_snippet": question_doc["answer_text_snippet"],
                    "page": question_doc["page"]
                })

        return {
            "status": "success",
            "total_pages": total_pages,
            "questions": all_questions
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in analyze_document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/pdf-questions/{notebook_id}")
async def get_pdf_questions(notebook_id: str, doc_id: Optional[str] = None, current_user: TokenData = Depends(get_current_user)):
    """Get generated questions for a notebook or specific document."""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        query = {"notebook_id": notebook_id}
        if doc_id:
            query["document_id"] = doc_id

        questions = []
        async for q in pdf_questions_collection.find(query).sort("created_at", -1):
            question = {
                "id": str(q["_id"]),
                "document_id": q.get("document_id"),
                "page_number": q.get("page_number"),
                "question_type": q.get("question_type"),
                "question": q.get("question"),
                "answer": q.get("answer"),
                "created_at": q.get("created_at")
            }
            questions.append(question)

        return {"questions": questions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ask")
async def ask_question(request: QuestionRequest, current_user: TokenData = Depends(get_current_user)):
    """Ask a question about the uploaded documents"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Get question embedding
        question_embedding = embedding_model.encode(request.question).tolist()

        # Build filter for notebook and specific documents if provided
        filter_dict = {"notebook_id": request.notebook_id}
        if request.document_ids:
            filter_dict["doc_id"] = {"$in": request.document_ids}

        # Query Pinecone
        results = index.query(
            vector=question_embedding,
            top_k=5,
            include_metadata=True,
            filter=filter_dict
        )

        if not results.matches:
            return {
                "answer": "I couldn't find any relevant information in the uploaded documents.",
                "sources": []
            }

        # Extract relevant context
        context_parts = []
        sources = []

        for match in results.matches:
            context_parts.append(match.metadata['text'])
            sources.append({
                "filename": match.metadata['filename'],
                "chunk_index": match.metadata['chunk_index'],
                "score": float(match.score)
            })

        context = "\n\n".join(context_parts)

        # Generate answer using Groq
        prompt = f"""Based on the following context from the uploaded documents, please answer the question.
If the answer cannot be found in the context, say so.

Context:
{context}

Question: {request.question}

Answer:"""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile",  # You can also use "mixtral-8x7b-32768" or other Groq models
            temperature=0.7,
            max_tokens=1024
        )

        answer = chat_completion.choices[0].message.content

        return {
            "answer": answer,
            "sources": sources
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== CHAT HISTORY ENDPOINTS ====================

@app.get("/chat-history/{notebook_id}")
async def get_chat_history(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get chat history for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        messages = []
        async for chat in chat_history_collection.find(
            {"notebook_id": notebook_id}
        ).sort("created_at", 1):
            messages.append({
                "role": chat["role"],
                "content": chat["content"],
                "created_at": chat["created_at"]
            })
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat-history")
async def save_chat_message(request: ChatHistorySave, current_user: TokenData = Depends(get_current_user)):
    """Save chat messages to history"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Save each message
        for message in request.messages:
            chat_data = {
                "notebook_id": request.notebook_id,
                "role": message.role,
                "content": message.content,
                "created_at": datetime.now().isoformat()
            }
            await chat_history_collection.insert_one(chat_data)
        return {"message": "Chat history saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/chat-history/{notebook_id}")
async def clear_chat_history(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Clear chat history for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        await chat_history_collection.delete_many({"notebook_id": notebook_id})
        return {"message": "Chat history cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== NOTES ENDPOINTS ====================

@app.get("/notes/{notebook_id}")
async def get_notes(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get all notes for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        notes = []
        async for note in notes_collection.find(
            {"notebook_id": notebook_id}
        ).sort("created_at", -1):
            notes.append({
                "id": str(note["_id"]),
                "title": note["title"],
                "content": note["content"],
                "note_type": note["note_type"],
                "color": note.get("color", "#ffffff"),
                "tags": note.get("tags", []),
                "created_at": note["created_at"],
                "updated_at": note.get("updated_at", note["created_at"])
            })
        return {"notes": notes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/notes")
async def create_note(note: NoteCreate, current_user: TokenData = Depends(get_current_user)):
    """Create a new note"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(note.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        note_data = {
            "notebook_id": note.notebook_id,
            "title": note.title,
            "content": note.content,
            "note_type": note.note_type,
            "color": note.color,
            "tags": note.tags or [],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        result = await notes_collection.insert_one(note_data)

        # Return serializable response
        return {
            "id": str(result.inserted_id),
            "notebook_id": note.notebook_id,
            "title": note.title,
            "content": note.content,
            "note_type": note.note_type,
            "color": note.color,
            "tags": note.tags or [],
            "created_at": note_data["created_at"],
            "updated_at": note_data["updated_at"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/notes/{note_id}")
async def update_note(note_id: str, note_update: NoteUpdate, current_user: TokenData = Depends(get_current_user)):
    """Update a note"""
    try:
        # Verify note ownership through notebook
        note = await notes_collection.find_one({"_id": ObjectId(note_id)})
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(note["notebook_id"]),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        update_data = {"updated_at": datetime.now().isoformat()}
        if note_update.title is not None:
            update_data["title"] = note_update.title
        if note_update.content is not None:
            update_data["content"] = note_update.content
        if note_update.color is not None:
            update_data["color"] = note_update.color
        if note_update.tags is not None:
            update_data["tags"] = note_update.tags

        await notes_collection.update_one(
            {"_id": ObjectId(note_id)},
            {"$set": update_data}
        )
        return {"message": "Note updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/notes/{note_id}")
async def delete_note(note_id: str, current_user: TokenData = Depends(get_current_user)):
    """Delete a note"""
    try:
        # Verify note ownership through notebook
        note = await notes_collection.find_one({"_id": ObjectId(note_id)})
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(note["notebook_id"]),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        await notes_collection.delete_one({"_id": ObjectId(note_id)})
        return {"message": "Note deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/notes/generate")
async def generate_note(request: NoteGenerateRequest, current_user: TokenData = Depends(get_current_user)):
    """Generate AI notes from documents"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Get relevant documents
        filter_dict = {"notebook_id": request.notebook_id}
        if request.document_ids:
            filter_dict["doc_id"] = {"$in": request.document_ids}

        # Query Pinecone for relevant content
        query_text = request.topic if request.topic else "comprehensive summary of all topics"
        query_embedding = get_embedding(query_text)

        if not query_embedding:
            raise HTTPException(status_code=500, detail="Failed to generate embedding")

        results = index.query(
            vector=query_embedding,
            top_k=10,
            filter=filter_dict,
            include_metadata=True
        )

        if not results['matches']:
            raise HTTPException(status_code=404, detail="No content found")

        # Gather context
        context_chunks = []
        for match in results['matches']:
            context_chunks.append(match['metadata']['text'])

        context = "\n\n".join(context_chunks)

        # Generate notes based on type
        if request.note_type == "summary":
            prompt = f"Create a comprehensive summary of the following content:\n\n{context}\n\nProvide a well-structured summary with key points."
            ai_note_type = "rich_text"
        elif request.note_type == "key_points":
            prompt = f"Extract and list the key points from the following content:\n\n{context}\n\nFormat as bullet points with brief explanations."
            ai_note_type = "rich_text"
        elif request.note_type == "mind_map":
            prompt = f"Create a mind map structure from the following content:\n\n{context}\n\nFormat as a hierarchical text structure with main topics and subtopics. Use indentation (2 spaces per level) to show hierarchy. Start each line with a dash. Example:\n- Main Topic 1\n  - Subtopic 1.1\n    - Detail 1.1.1\n  - Subtopic 1.2\n- Main Topic 2"
            ai_note_type = "ai_mindmap"
        elif request.note_type == "flashcards":
            prompt = f"Create study flashcards from the following content:\n\n{context}\n\nFormat each flashcard as:\nQ: [Question]\nA: [Answer]\n\nCreate 5-10 flashcards covering the most important concepts. Separate each flashcard with a blank line."
            ai_note_type = "ai_flashcards"
        elif request.note_type == "timeline":
            prompt = f"Create a chronological timeline from the following content:\n\n{context}\n\nFormat each event as:\n[Date/Year]: [Event Title]\n[Description]\n\nList events in chronological order. Separate each event with a blank line."
            ai_note_type = "ai_timeline"
        elif request.note_type == "comparison_table":
            prompt = f"Create a comparison table from the following content:\n\n{context}\n\nFormat as a markdown table comparing key concepts, features, or topics. Include relevant columns and rows."
            ai_note_type = "rich_text"
        else:
            prompt = f"Create study notes from the following content:\n\n{context}\n\nMake it comprehensive and well-organized."
            ai_note_type = "rich_text"

        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=2000
        )

        generated_content = completion.choices[0].message.content

        # Create the note
        title = f"AI Generated {request.note_type.replace('_', ' ').title()}"
        if request.topic:
            title += f": {request.topic}"

        note_data = {
            "notebook_id": request.notebook_id,
            "title": title,
            "content": generated_content,
            "note_type": ai_note_type,
            "color": "#e3f2fd",
            "tags": ["AI Generated", request.note_type],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

        result = await notes_collection.insert_one(note_data)

        # Return serializable response
        return {
            "id": str(result.inserted_id),
            "notebook_id": request.notebook_id,
            "title": title,
            "content": generated_content,
            "note_type": ai_note_type,
            "color": "#e3f2fd",
            "tags": ["AI Generated", request.note_type],
            "created_at": note_data["created_at"],
            "updated_at": note_data["updated_at"]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating note: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ANNOTATIONS ENDPOINTS ====================

@app.get("/annotations/{notebook_id}")
async def get_annotations(notebook_id: str, document_id: Optional[str] = None, current_user: TokenData = Depends(get_current_user)):
    """Get annotations for a notebook or specific document"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        filter_dict = {"notebook_id": notebook_id}
        if document_id:
            filter_dict["document_id"] = document_id

        annotations = []
        async for ann in annotations_collection.find(filter_dict).sort("created_at", -1):
            # Build base annotation object
            annotation_obj = {
                "id": str(ann["_id"]),
                "document_id": ann["document_id"],
                "annotation_type": ann.get("annotation_type", "highlight"),
                "color": ann.get("color", "#ffeb3b"),
                "note": ann.get("note"),
                "created_at": ann["created_at"]
            }

            # Add PDF-specific fields if they exist
            if "page_number" in ann:
                annotation_obj["page_number"] = ann["page_number"]
            if "highlighted_text" in ann:
                annotation_obj["highlighted_text"] = ann["highlighted_text"]
            if "position" in ann:
                annotation_obj["position"] = ann["position"]

            # Add video-specific fields if they exist
            if "timestamp_start" in ann:
                annotation_obj["timestamp_start"] = ann["timestamp_start"]
            if "timestamp_end" in ann:
                annotation_obj["timestamp_end"] = ann["timestamp_end"]

            annotations.append(annotation_obj)
        return {"annotations": annotations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/annotations")
async def create_annotation(annotation: AnnotationCreate, current_user: TokenData = Depends(get_current_user)):
    """Create a new annotation (text highlight or video timestamp)"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(annotation.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        ann_data = {
            "notebook_id": annotation.notebook_id,
            "document_id": annotation.document_id,
            "annotation_type": annotation.annotation_type,
            "color": annotation.color,
            "note": annotation.note,
            "created_at": datetime.now().isoformat()
        }

        # Add fields based on annotation type
        if annotation.annotation_type in ["highlight", "both"]:
            ann_data["page_number"] = annotation.page_number
            ann_data["highlighted_text"] = annotation.highlighted_text
            ann_data["position"] = annotation.position

        if annotation.annotation_type in ["timestamp", "both"]:
            ann_data["timestamp_start"] = annotation.timestamp_start
            ann_data["timestamp_end"] = annotation.timestamp_end

        result = await annotations_collection.insert_one(ann_data)

        # Return serializable response
        response_data = {
            "id": str(result.inserted_id),
            "notebook_id": annotation.notebook_id,
            "document_id": annotation.document_id,
            "annotation_type": annotation.annotation_type,
            "color": annotation.color,
            "note": annotation.note,
            "created_at": ann_data["created_at"]
        }

        # Include relevant fields based on annotation type
        if annotation.annotation_type in ["highlight", "both"]:
            response_data["page_number"] = annotation.page_number
            response_data["highlighted_text"] = annotation.highlighted_text
            response_data["position"] = annotation.position

        if annotation.annotation_type in ["timestamp", "both"]:
            response_data["timestamp_start"] = annotation.timestamp_start
            response_data["timestamp_end"] = annotation.timestamp_end

        return response_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/annotations/{annotation_id}")
async def delete_annotation(annotation_id: str, current_user: TokenData = Depends(get_current_user)):
    """Delete an annotation"""
    try:
        # Verify annotation ownership through notebook
        annotation = await annotations_collection.find_one({"_id": ObjectId(annotation_id)})
        if not annotation:
            raise HTTPException(status_code=404, detail="Annotation not found")

        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(annotation["notebook_id"]),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        await annotations_collection.delete_one({"_id": ObjectId(annotation_id)})
        return {"message": "Annotation deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/annotations/query")
async def query_annotation(request: AnnotationQueryRequest, current_user: TokenData = Depends(get_current_user)):
    """Ask AI about highlighted text"""
    try:
        # Get the annotation
        annotation = await annotations_collection.find_one({"_id": ObjectId(request.annotation_id)})
        if not annotation:
            raise HTTPException(status_code=404, detail="Annotation not found")

        # Verify annotation ownership through notebook
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(annotation["notebook_id"]),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        # Use context from request or fall back to annotation's highlighted_text
        context_text = request.context or annotation.get('highlighted_text', '')

        if not context_text:
            raise HTTPException(status_code=400, detail="No context available for this annotation")

        # Create prompt with context
        annotation_type = annotation.get('annotation_type', 'highlight')
        context_label = "transcript segment" if annotation_type in ['timestamp', 'both'] else "highlighted text"

        prompt = f"""Based on this {context_label} from the document:

"{context_text}"

Question: {request.question}

Provide a clear and detailed answer."""

        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=500
        )

        answer = completion.choices[0].message.content

        return {
            "question": request.question,
            "context": context_text,
            "answer": answer
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error querying annotation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== UTILITY ENDPOINTS ====================

@app.delete("/clear-all")
async def clear_all(current_user: TokenData = Depends(get_current_user)):
    """Clear all documents and vectors"""
    try:
        # Delete all vectors from Pinecone
        index.delete(delete_all=True)

        # Clear documents store
        documents_store.clear()

        return {"message": "All documents cleared successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ====================================
# Reading Progress Endpoints
# ====================================

@app.post("/reading-progress")
async def save_reading_progress(request: ReadingProgressUpdate, current_user: TokenData = Depends(get_current_user)):
    """Save or update reading progress for a document"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Calculate completion percentage
        completion_percentage = 0.0

        # Get existing progress to maintain completed_pages list
        existing_progress = await reading_progress_collection.find_one({
            "user_id": current_user.user_id,
            "document_id": request.document_id
        })

        completed_pages = existing_progress.get("completed_pages", []) if existing_progress else []

        # Add current page to completed pages if mark_completed is True
        if request.mark_completed and request.current_page not in completed_pages:
            completed_pages.append(request.current_page)

        # Calculate completion percentage
        if request.total_pages > 0:
            completion_percentage = (len(completed_pages) / request.total_pages) * 100

        # Prepare update document
        progress_doc = {
            "user_id": current_user.user_id,
            "notebook_id": request.notebook_id,
            "document_id": request.document_id,
            "current_page": request.current_page,
            "total_pages": request.total_pages,
            "completed_pages": completed_pages,
            "completion_percentage": completion_percentage,
            "last_read_at": datetime.now(),
            "updated_at": datetime.now()
        }

        # Increment time spent if provided
        if request.time_spent_seconds and request.time_spent_seconds > 0:
            await reading_progress_collection.update_one(
                {
                    "user_id": current_user.user_id,
                    "document_id": request.document_id
                },
                {
                    "$set": progress_doc,
                    "$inc": {"time_spent_seconds": request.time_spent_seconds},
                    "$setOnInsert": {"created_at": datetime.now()}
                },
                upsert=True
            )
        else:
            await reading_progress_collection.update_one(
                {
                    "user_id": current_user.user_id,
                    "document_id": request.document_id
                },
                {
                    "$set": progress_doc,
                    "$setOnInsert": {
                        "created_at": datetime.now(),
                        "time_spent_seconds": 0
                    }
                },
                upsert=True
            )

        return {
            "success": True,
            "current_page": request.current_page,
            "completion_percentage": completion_percentage,
            "completed_pages_count": len(completed_pages)
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving reading progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reading-progress/all/{notebook_id}")
async def get_all_reading_progress(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get reading progress for all documents in a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Fetch all progress for this notebook
        progress_list = []
        async for progress in reading_progress_collection.find({
            "user_id": current_user.user_id,
            "notebook_id": notebook_id
        }):
            progress.pop("_id", None)

            # Fetch document details to get filename
            document = await documents_collection.find_one({"doc_id": progress["document_id"]})
            if document:
                progress["filename"] = document.get("filename", "Unknown")
            else:
                progress["filename"] = "Unknown"

            # Count bookmarks for this document
            bookmarks_count = await bookmarks_collection.count_documents({
                "user_id": current_user.user_id,
                "document_id": progress["document_id"]
            })
            progress["bookmarks_count"] = bookmarks_count

            progress_list.append(progress)

        # Create a map by document_id for easy lookup
        progress_map = {p["document_id"]: p for p in progress_list}

        return {
            "notebook_id": notebook_id,
            "progress": progress_map
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching all reading progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reading-progress/{notebook_id}/{doc_id}")
async def get_reading_progress(notebook_id: str, doc_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get reading progress for a specific document"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Fetch progress
        progress = await reading_progress_collection.find_one({
            "user_id": current_user.user_id,
            "document_id": doc_id
        })

        if not progress:
            return {
                "has_progress": False,
                "current_page": 1,
                "completion_percentage": 0,
                "completed_pages": [],
                "time_spent_seconds": 0
            }

        progress.pop("_id", None)
        progress["has_progress"] = True
        return progress

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching reading progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ====================================
# Bookmarks Endpoints
# ====================================

@app.post("/bookmarks")
async def create_bookmark(request: BookmarkCreate, current_user: TokenData = Depends(get_current_user)):
    """Create a bookmark for a specific page"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Create bookmark
        bookmark = {
            "user_id": current_user.user_id,
            "notebook_id": request.notebook_id,
            "document_id": request.document_id,
            "page_number": request.page_number,
            "title": request.title or f"Page {request.page_number}",
            "note": request.note,
            "created_at": datetime.now()
        }

        result = await bookmarks_collection.insert_one(bookmark)
        bookmark["_id"] = str(result.inserted_id)

        return {
            "success": True,
            "bookmark_id": str(result.inserted_id),
            "bookmark": bookmark
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating bookmark: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bookmarks/{notebook_id}/{doc_id}")
async def get_bookmarks(notebook_id: str, doc_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get all bookmarks for a specific document"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Fetch bookmarks
        bookmarks = []
        async for bookmark in bookmarks_collection.find({
            "user_id": current_user.user_id,
            "document_id": doc_id
        }).sort("page_number", 1):  # Sort by page number
            bookmark["_id"] = str(bookmark["_id"])
            bookmarks.append(bookmark)

        return {
            "document_id": doc_id,
            "bookmarks": bookmarks
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching bookmarks: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/bookmarks/{bookmark_id}")
async def update_bookmark(bookmark_id: str, request: BookmarkUpdate, current_user: TokenData = Depends(get_current_user)):
    """Update a bookmark's title or note"""
    try:
        # Verify bookmark ownership
        bookmark = await bookmarks_collection.find_one({"_id": ObjectId(bookmark_id)})
        if not bookmark:
            raise HTTPException(status_code=404, detail="Bookmark not found")

        if bookmark["user_id"] != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Update bookmark
        update_data = {}
        if request.title is not None:
            update_data["title"] = request.title
        if request.note is not None:
            update_data["note"] = request.note

        if update_data:
            await bookmarks_collection.update_one(
                {"_id": ObjectId(bookmark_id)},
                {"$set": update_data}
            )

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating bookmark: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/bookmarks/{bookmark_id}")
async def delete_bookmark(bookmark_id: str, current_user: TokenData = Depends(get_current_user)):
    """Delete a bookmark"""
    try:
        # Verify bookmark ownership
        bookmark = await bookmarks_collection.find_one({"_id": ObjectId(bookmark_id)})
        if not bookmark:
            raise HTTPException(status_code=404, detail="Bookmark not found")

        if bookmark["user_id"] != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Delete bookmark
        await bookmarks_collection.delete_one({"_id": ObjectId(bookmark_id)})

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting bookmark: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)