"""
Nexus Learn - FastAPI Backend Server
===============================

An AI-powered learning and preparation platform that combines:
- RAG (Retrieval-Augmented Generation) for document Q&A
- Quiz and mock test generation
- Note-taking and PDF annotations
- Virtual interview preparation
- Interactive learning features (doomscroll, flashcards)

Tech Stack:
- FastAPI: Modern Python web framework
- Groq API: LLM for text generation and Q&A
- Pinecone: Vector database for semantic search
- MongoDB: Document database for persistent storage
- SentenceTransformers: Local embedding generation

Project: Nexus Learn
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
    quiz_results_collection,
    mock_test_results_collection,
    chat_history_collection,
    notes_collection,
    annotations_collection,
    interview_sessions_collection,
    saved_cards_collection,
    doomscroll_folders_collection,
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
    title="Nexus Learn API",
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
# Used for text generation, Q&A, quiz generation, and interview responses
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Sentence Transformer Model
# Converts text to 768-dimensional embeddings for semantic search
# Model: all-mpnet-base-v2 (best quality for semantic similarity)
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
# These stores cache data temporarily during runtime
# Persistent data is stored in MongoDB

# Document metadata cache (supplementary to MongoDB)
documents_store = {}

# Generated quizzes cache (before storing in MongoDB)
quizzes_store = {}

# Generated mock tests cache (before storing in MongoDB)
mock_tests_store = {}


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


# Quiz Models
# ===========
class QuizGenerateRequest(BaseModel):
    """Model for generating a quiz from documents"""
    notebook_id: str
    document_ids: Optional[List[str]] = None  # Specific documents (None = all)
    num_questions: int = 5  # Number of MCQ questions
    difficulty: str = "medium"  # easy, medium, hard
    page_numbers: Optional[List[int]] = None  # Limit to specific pages (for reading progress)

class QuizAnswer(BaseModel):
    """Model for a single quiz answer"""
    question_index: int  # Question number (0-indexed)
    selected_option: int  # Selected option (0-3 for A-D)

class QuizSubmitRequest(BaseModel):
    """Model for submitting quiz answers"""
    quiz_id: str  # Generated quiz identifier
    answers: List[QuizAnswer]


# Mock Test Models
# ================
class MockTestGenerateRequest(BaseModel):
    """Model for generating a comprehensive mock test"""
    notebook_id: str
    document_ids: Optional[List[str]] = None
    num_theory: int = 3  # Number of theory questions
    num_coding: int = 2  # Number of coding questions
    num_reorder: int = 2  # Number of reordering questions
    difficulty: str = "medium"  # easy, medium, hard
    programming_language: str = "python"  # For coding questions
    page_numbers: Optional[List[int]] = None  # Limit to specific pages (for reading progress)

class TheoryAnswer(BaseModel):
    """Model for theory question answer"""
    question_index: int
    answer_text: str  # Long-form text answer

class CodingAnswer(BaseModel):
    """Model for coding question answer"""
    question_index: int
    code: str  # Code solution
    language: str  # Programming language used

class ReorderAnswer(BaseModel):
    """Model for reordering question answer"""
    question_index: int
    ordered_items: List[str]  # Correctly ordered items

class MockTestSubmitRequest(BaseModel):
    """Model for submitting mock test answers"""
    test_id: str
    theory_answers: List[TheoryAnswer]
    coding_answers: List[CodingAnswer]
    reorder_answers: List[ReorderAnswer]


# Notes Models
# ============
class NoteCreate(BaseModel):
    """Model for creating a new note"""
    notebook_id: str
    title: str
    content: str  # Can be text, HTML, JSON for drawing, or structured data
    note_type: str = "text"  # text, rich_text, drawing, ai_mindmap, ai_flashcards, ai_quiz, ai_timeline
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
    note_type: str = "summary"  # summary, key_points, mind_map, flashcards, quiz, timeline, comparison_table


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

@app.post("/generate-quiz")
async def generate_quiz(request: QuizGenerateRequest, current_user: TokenData = Depends(get_current_user)):
    """Generate a quiz based on uploaded documents"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        print(f"Generating quiz with {request.num_questions} questions, difficulty: {request.difficulty}")

        # Check if notebook has documents
        doc_count = await documents_collection.count_documents({"notebook_id": request.notebook_id})
        if doc_count == 0:
            raise HTTPException(status_code=400, detail="No documents uploaded. Please upload documents first.")

        # Build filter for notebook and specific documents if provided
        filter_dict = {"notebook_id": request.notebook_id}
        if request.document_ids:
            filter_dict["doc_id"] = {"$in": request.document_ids}
        if request.page_numbers:
            filter_dict["page_number"] = {"$in": request.page_numbers}

        # Get random chunks from documents
        # We'll query multiple times with different random embeddings to get diverse content
        all_chunks = []
        num_queries = min(request.num_questions * 2, 10)  # Get more chunks than questions needed

        for _ in range(num_queries):
            # Create a random query to get different chunks
            random_text = f"question {random.randint(1, 10000)}"
            query_embedding = embedding_model.encode(random_text).tolist()

            results = index.query(
                vector=query_embedding,
                top_k=3,
                include_metadata=True,
                filter=filter_dict
            )

            for match in results.matches:
                if match.metadata['text'] not in [c['text'] for c in all_chunks]:
                    all_chunks.append({
                        'text': match.metadata['text'],
                        'filename': match.metadata['filename']
                    })

        # Limit to a reasonable amount of context
        selected_chunks = all_chunks[:min(len(all_chunks), request.num_questions * 2)]

        if not selected_chunks:
            raise HTTPException(status_code=400, detail="Could not retrieve content from documents. Please ensure documents are properly uploaded.")

        context = "\n\n".join([chunk['text'] for chunk in selected_chunks])
        print(f"Retrieved {len(selected_chunks)} chunks for quiz generation")

        # Determine difficulty instruction based on mixed vs fixed difficulty
        if request.difficulty.lower() == "mixed":
            difficulty_instruction = """4. Difficulty level: MIXED - Randomly distribute difficulties across all questions. Each question should have "difficulty" set to either "easy", "medium", or "hard".
   - Aim for a balanced mix (roughly equal distribution)
   - Hard questions should test deeper understanding and analysis
   - Medium questions should test solid comprehension
   - Easy questions should test basic recall"""
            difficulty_field = '"difficulty": "easy" or "medium" or "hard",'
        else:
            difficulty_instruction = f"4. Difficulty level: {request.difficulty} - ALL questions should have the same difficulty level"
            difficulty_field = f'"difficulty": "{request.difficulty}",'

        # Generate quiz using Groq
        prompt = f"""Based on the following content from educational documents, generate {request.num_questions} multiple-choice questions (MCQs).

Content:
{context}

Requirements:
1. Generate exactly {request.num_questions} questions
2. Each question should have 4 options (A, B, C, D)
3. Questions should test understanding of the content
{difficulty_instruction}
5. Indicate the correct answer for each question
6. Questions should be diverse and cover different topics from the content

Format your response as a JSON array with this structure:
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": 0,
    "explanation": "Brief explanation of why this is correct",
    "topic": "Main topic this question covers",
    {difficulty_field}
  }}
]

IMPORTANT: Return ONLY the JSON array, no additional text."""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful educational assistant that creates high-quality quiz questions. Always respond with valid JSON only."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=2048
        )

        response_text = chat_completion.choices[0].message.content.strip()

        # Try to extract JSON if there's extra text
        # Look for JSON array in the response
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            response_text = json_match.group()

        questions = json.loads(response_text)

        # Generate quiz ID
        quiz_id = str(uuid.uuid4())

        # Store quiz
        quizzes_store[quiz_id] = {
            "id": quiz_id,
            "questions": questions,
            "created_at": datetime.now().isoformat(),
            "document_ids": request.document_ids,
            "num_questions": len(questions),
            "notebook_id": request.notebook_id,
            "user_id": current_user.user_id,
            "difficulty": request.difficulty
        }

        # Return questions without correct answers (but include difficulty for display)
        questions_for_user = [
            {
                "question": q["question"],
                "options": q["options"],
                "topic": q.get("topic", "General"),
                "difficulty": q.get("difficulty", request.difficulty)
            }
            for q in questions
        ]

        return {
            "quiz_id": quiz_id,
            "questions": questions_for_user,
            "total_questions": len(questions)
        }

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse quiz questions: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/submit-quiz")
async def submit_quiz(request: QuizSubmitRequest):
    """Submit quiz answers and get score with analysis"""
    try:
        if request.quiz_id not in quizzes_store:
            raise HTTPException(status_code=404, detail="Quiz not found")

        quiz = quizzes_store[request.quiz_id]
        questions = quiz["questions"]

        # Calculate score with difficulty-based weighting
        # Difficulty weights: easy=1.0, medium=1.5, hard=2.0
        def get_difficulty_weight(difficulty):
            weights = {
                "easy": 1.0,
                "medium": 1.5,
                "hard": 2.0
            }
            return weights.get(difficulty.lower() if difficulty else "medium", 1.5)

        correct_count = 0
        total_questions = len(questions)
        results = []
        topic_performance = {}
        weighted_score_sum = 0
        total_weight = 0

        for answer in request.answers:
            question = questions[answer.question_index]
            is_correct = answer.selected_option == question["correct_answer"]
            difficulty = question.get("difficulty", quiz.get("difficulty", "medium"))
            weight = get_difficulty_weight(difficulty)

            # Add to weighted score
            total_weight += weight
            if is_correct:
                correct_count += 1
                weighted_score_sum += weight

            topic = question.get("topic", "General")
            if topic not in topic_performance:
                topic_performance[topic] = {"correct": 0, "total": 0}

            topic_performance[topic]["total"] += 1
            if is_correct:
                topic_performance[topic]["correct"] += 1

            results.append({
                "question_index": answer.question_index,
                "question": question["question"],
                "selected_option": answer.selected_option,
                "correct_answer": question["correct_answer"],
                "is_correct": is_correct,
                "explanation": question.get("explanation", ""),
                "topic": topic,
                "difficulty": difficulty
            })

        # Calculate weighted score percentage
        score_percentage = (weighted_score_sum / total_weight * 100) if total_weight > 0 else 0

        # Generate analysis using Groq
        weak_topics = [
            topic for topic, perf in topic_performance.items()
            if perf["correct"] / perf["total"] < 0.6
        ]

        strong_topics = [
            topic for topic, perf in topic_performance.items()
            if perf["correct"] / perf["total"] >= 0.8
        ]

        analysis_prompt = f"""Analyze this quiz performance and provide personalized feedback:

Score: {correct_count}/{total_questions} ({score_percentage:.1f}%)

Topic Performance:
{json.dumps(topic_performance, indent=2)}

Weak Topics: {', '.join(weak_topics) if weak_topics else 'None'}
Strong Topics: {', '.join(strong_topics) if strong_topics else 'None'}

Provide:
1. Brief overall assessment (2-3 sentences)
2. Specific areas to improve with actionable recommendations
3. Strengths to maintain
4. Study suggestions

Keep the response concise, encouraging, and actionable."""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": analysis_prompt
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=1024
        )

        analysis = chat_completion.choices[0].message.content

        # Save quiz result to database
        quiz_result = {
            "user_id": quiz["user_id"],
            "notebook_id": quiz["notebook_id"],
            "quiz_id": request.quiz_id,
            "score": correct_count,
            "total_questions": total_questions,
            "score_percentage": score_percentage,
            "results": results,
            "topic_performance": topic_performance,
            "difficulty": quiz.get("difficulty", "medium"),
            "weak_topics": weak_topics,
            "strong_topics": strong_topics,
            "analysis": analysis,
            "created_at": datetime.now().isoformat()
        }
        await quiz_results_collection.insert_one(quiz_result)

        return {
            "quiz_id": request.quiz_id,
            "score": correct_count,
            "total_questions": total_questions,
            "score_percentage": score_percentage,
            "results": results,
            "topic_performance": topic_performance,
            "analysis": analysis,
            "weak_topics": weak_topics,
            "strong_topics": strong_topics
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/quiz-history/{notebook_id}")
async def get_quiz_history(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get all quiz attempts for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Fetch all quiz results for this notebook
        quiz_results = []
        async for result in quiz_results_collection.find(
            {"notebook_id": notebook_id}
        ).sort("created_at", -1):  # Most recent first
            # Remove MongoDB _id for JSON serialization
            result.pop("_id", None)
            quiz_results.append(result)

        return {
            "notebook_id": notebook_id,
            "total_quizzes": len(quiz_results),
            "quiz_history": quiz_results
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-mock-test")
async def generate_mock_test(request: MockTestGenerateRequest, current_user: TokenData = Depends(get_current_user)):
    """Generate a comprehensive mock test with theory, coding, and reorder questions"""
    try:
        print(f"Generating mock test: {request.num_theory} theory, {request.num_coding} coding, {request.num_reorder} reorder")

        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Check if notebook has documents
        doc_count = await documents_collection.count_documents({"notebook_id": request.notebook_id})
        if doc_count == 0:
            raise HTTPException(status_code=400, detail="No documents uploaded. Please upload documents first.")

        # Build filter for notebook and specific documents if provided
        filter_dict = {"notebook_id": request.notebook_id}
        if request.document_ids:
            filter_dict["doc_id"] = {"$in": request.document_ids}
        if request.page_numbers:
            filter_dict["page_number"] = {"$in": request.page_numbers}

        # Get diverse chunks from documents
        all_chunks = []
        num_queries = min((request.num_theory + request.num_coding + request.num_reorder) * 2, 15)

        for _ in range(num_queries):
            random_text = f"test {random.randint(1, 10000)}"
            query_embedding = embedding_model.encode(random_text).tolist()

            results = index.query(
                vector=query_embedding,
                top_k=3,
                include_metadata=True,
                filter=filter_dict
            )

            for match in results.matches:
                if match.metadata['text'] not in [c['text'] for c in all_chunks]:
                    all_chunks.append({
                        'text': match.metadata['text'],
                        'filename': match.metadata['filename']
                    })

        if not all_chunks:
            raise HTTPException(status_code=400, detail="Could not retrieve content from documents.")

        context = "\n\n".join([chunk['text'] for chunk in all_chunks])

        # Detect if content has code (for determining if coding questions are applicable)
        has_code = any(keyword in context.lower() for keyword in ['function', 'class', 'def ', 'int ', 'string', 'array', 'algorithm'])

        # Generate questions using Groq
        # Language-specific examples
        lang_examples = {
            "python": 'def function_name(params):',
            "javascript": 'function functionName(params) { }',
            "java": 'public returnType functionName(params) { }',
            "cpp": 'returnType functionName(params) { }',
            "c": 'returnType functionName(params) { }',
            "go": 'func functionName(params) returnType { }',
            "rust": 'fn function_name(params) -> ReturnType { }',
            "typescript": 'function functionName(params): ReturnType { }'
        }

        func_example = lang_examples.get(request.programming_language.lower(), 'def function_name(params):')

        # Determine difficulty instruction based on mixed vs fixed difficulty
        if request.difficulty.lower() == "mixed":
            difficulty_instruction = """7. Difficulty: MIXED - Randomly distribute difficulties across all questions. Each question should have "difficulty" set to either "easy", "medium", or "hard".
   - Aim for a balanced mix (roughly equal distribution)
   - Hard questions should be more conceptually challenging or require deeper analysis
   - Medium questions should test solid understanding
   - Easy questions should test basic recall and simple concepts"""
            difficulty_example = '"easy" or "medium" or "hard"'
        else:
            difficulty_instruction = f"7. Difficulty: {request.difficulty} - ALL questions should have the same difficulty level"
            difficulty_example = f'"{request.difficulty}"'

        prompt = f"""Based on the following educational content, generate a comprehensive mock test.

Content:
{context}

Generate a JSON object with the following structure:
{{
  "theory_questions": [
    {{
      "question": "Theory question text?",
      "topic": "Topic name",
      "expected_points": ["key point 1", "key point 2"],
      "difficulty": {difficulty_example}
    }}
  ],
  "coding_questions": [
    {{
      "question": "Coding problem description",
      "topic": "Topic name",
      "function_signature": "{func_example}",
      "language": "{request.programming_language}",
      "test_cases": [
        {{"input": "example input", "expected_output": "expected result"}}
      ],
      "difficulty": {difficulty_example}
    }}
  ],
  "reorder_questions": [
    {{
      "question": "Put these steps in the correct order:",
      "topic": "Topic name",
      "items": ["Step 1", "Step 2", "Step 3", "Step 4"],
      "correct_order": ["Step 2", "Step 1", "Step 4", "Step 3"],
      "difficulty": {difficulty_example}
    }}
  ]
}}

Requirements:
1. Generate {request.num_theory} theory questions that require written explanations
2. Generate {request.num_coding if has_code else 0} coding questions in {request.programming_language.upper()} {"(code-related content detected)" if has_code else "(skip if content is not programming-related)"}
3. Generate {request.num_reorder} reordering questions for sequential/procedural content
4. Theory questions should test understanding and ask for explanations
5. Coding questions MUST be in {request.programming_language.upper()} with appropriate syntax and function signatures
6. Reorder questions should have items shuffled (not in correct order), make sure not to add obvious hints to these reordering questions.)
{difficulty_instruction}

IMPORTANT: Return ONLY the JSON object, no additional text."""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert educational assessment creator. Always respond with valid JSON only."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=3000
        )

        response_text = chat_completion.choices[0].message.content.strip()

        # Extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            response_text = json_match.group()

        test_data = json.loads(response_text)

        # Generate test ID
        test_id = str(uuid.uuid4())

        # Store test with correct answers
        mock_tests_store[test_id] = {
            "id": test_id,
            "user_id": current_user.user_id,
            "notebook_id": request.notebook_id,
            "theory_questions": test_data.get("theory_questions", []),
            "coding_questions": test_data.get("coding_questions", []) if has_code else [],
            "reorder_questions": test_data.get("reorder_questions", []),
            "created_at": datetime.now().isoformat(),
            "document_ids": request.document_ids,
            "has_code": has_code,
            "difficulty": request.difficulty,
            "programming_language": request.programming_language
        }

        # Return questions without answers (but include difficulty for display purposes)
        return {
            "test_id": test_id,
            "theory_questions": [
                {
                    "question": q["question"],
                    "topic": q.get("topic", "General"),
                    "difficulty": q.get("difficulty", request.difficulty)
                }
                for q in test_data.get("theory_questions", [])
            ],
            "coding_questions": [
                {
                    "question": q["question"],
                    "topic": q.get("topic", "Coding"),
                    "function_signature": q.get("function_signature", ""),
                    "language": q.get("language", "python"),
                    "test_cases": [{"input": tc["input"]} for tc in q.get("test_cases", [])],
                    "difficulty": q.get("difficulty", request.difficulty)
                }
                for q in (test_data.get("coding_questions", []) if has_code else [])
            ],
            "reorder_questions": [
                {
                    "question": q["question"],
                    "topic": q.get("topic", "General"),
                    "items": q["items"],  # Already shuffled by AI
                    "difficulty": q.get("difficulty", request.difficulty)
                }
                for q in test_data.get("reorder_questions", [])
            ],
            "total_questions": len(test_data.get("theory_questions", [])) +
                             len(test_data.get("coding_questions", []) if has_code else []) +
                             len(test_data.get("reorder_questions", []))
        }

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse test questions: {str(e)}")
    except Exception as e:
        print(f"Error generating mock test: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/submit-mock-test")
async def submit_mock_test(request: MockTestSubmitRequest, current_user: TokenData = Depends(get_current_user)):
    """Submit mock test answers and get AI evaluation"""
    try:
        print(f"Submitting mock test: {request.test_id}")

        if request.test_id not in mock_tests_store:
            raise HTTPException(status_code=404, detail="Test not found")

        test = mock_tests_store[request.test_id]

        # Verify test ownership
        if test.get("user_id") != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        print(f"Test found. Theory: {len(test['theory_questions'])}, Coding: {len(test['coding_questions'])}, Reorder: {len(test['reorder_questions'])}")
        print(f"Submitted answers - Theory: {len(request.theory_answers)}, Coding: {len(request.coding_answers)}, Reorder: {len(request.reorder_answers)}")

        # Evaluate theory questions
        theory_results = []
        for answer in request.theory_answers:
            if answer.question_index >= len(test["theory_questions"]):
                print(f"Warning: Theory question index {answer.question_index} out of range")
                continue
            question = test["theory_questions"][answer.question_index]

            # Use AI to evaluate the answer
            eval_prompt = f"""Evaluate this answer to a theory question and respond with ONLY a JSON object.

Question: {question['question']}

Expected key points: {', '.join(question.get('expected_points', []))}

Student's answer: {answer.answer_text}

Return ONLY this JSON format (no other text):
{{
  "score": <number 0-100>,
  "feedback": "<detailed feedback on what was good and what was missing>",
  "covered_points": ["<point 1>", "<point 2>"],
  "missing_points": ["<point 1>", "<point 2>"]
}}

Be fair but thorough. Award partial credit for partially correct answers. If the user didn't answer the question at all, provide 0 to the user and return feedback saying that the user didn't attempt the question at all.
CRITICAL: Return ONLY the JSON object. No explanations before or after."""

            eval_completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are an educational evaluator. You MUST respond with ONLY valid JSON. No markdown, no explanations, just the JSON object."
                    },
                    {
                        "role": "user",
                        "content": eval_prompt
                    }
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.2,
                max_tokens=500
            )

            eval_text = eval_completion.choices[0].message.content.strip()

            # Remove markdown code blocks if present
            eval_text = re.sub(r'^```json\s*', '', eval_text)
            eval_text = re.sub(r'^```\s*', '', eval_text)
            eval_text = re.sub(r'\s*```$', '', eval_text)
            eval_text = eval_text.strip()

            # Extract JSON object
            json_match = re.search(r'\{[\s\S]*\}', eval_text)
            if json_match:
                eval_text = json_match.group()

            try:
                evaluation = json.loads(eval_text)
                # Validate required fields
                if "score" not in evaluation or "feedback" not in evaluation:
                    raise ValueError("Missing required fields in evaluation")
            except (json.JSONDecodeError, ValueError) as e:
                print(f"JSON parse error for theory question {answer.question_index}: {str(e)}")
                print(f"Response text: {eval_text[:500]}")  # Print first 500 chars
                # Fallback evaluation
                evaluation = {
                    "score": 50,
                    "feedback": "Your answer has been recorded but could not be fully evaluated. Consider providing more detail and covering the key concepts.",
                    "covered_points": [],
                    "missing_points": []
                }

            theory_results.append({
                "question_index": answer.question_index,
                "question": question["question"],
                "user_answer": answer.answer_text,
                "score": evaluation["score"],
                "feedback": evaluation["feedback"],
                "covered_points": evaluation.get("covered_points", []),
                "missing_points": evaluation.get("missing_points", []),
                "topic": question.get("topic", "General"),
                "difficulty": question.get("difficulty", test.get("difficulty", "medium"))
            })

        # Evaluate coding questions
        coding_results = []
        for answer in request.coding_answers:
            if answer.question_index >= len(test["coding_questions"]):
                print(f"Warning: Coding question index {answer.question_index} out of range")
                continue
            question = test["coding_questions"][answer.question_index]

            # Use AI to evaluate the code
            eval_prompt = f"""Evaluate this code solution and respond with ONLY a JSON object.

Problem: {question['question']}

Expected function signature: {question.get('function_signature', '')}

Test cases:
{json.dumps(question.get('test_cases', []), indent=2)}

Student's code:
```{answer.language}
{answer.code}
```

Return ONLY this JSON format (no other text):
{{
  "score": <number 0-100>,
  "correctness": "<brief assessment of logic>",
  "code_quality": "<brief assessment of quality>",
  "test_results": ["<pass or fail for each test>"],
  "feedback": "<detailed feedback in 2-3 sentences>",
  "suggestions": ["<suggestion 1>", "<suggestion 2>"]
}}

CRITICAL: Return ONLY the JSON object. No explanations before or after."""

            eval_completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a code evaluator. You MUST respond with ONLY valid JSON. No markdown, no explanations, just the JSON object."
                    },
                    {
                        "role": "user",
                        "content": eval_prompt
                    }
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.2,
                max_tokens=800
            )

            eval_text = eval_completion.choices[0].message.content.strip()

            # Remove markdown code blocks if present
            eval_text = re.sub(r'^```json\s*', '', eval_text)
            eval_text = re.sub(r'^```\s*', '', eval_text)
            eval_text = re.sub(r'\s*```$', '', eval_text)
            eval_text = eval_text.strip()

            # Extract JSON object
            json_match = re.search(r'\{[\s\S]*\}', eval_text)
            if json_match:
                eval_text = json_match.group()

            try:
                evaluation = json.loads(eval_text)
                # Validate required fields
                if "score" not in evaluation or "feedback" not in evaluation:
                    raise ValueError("Missing required fields in evaluation")
            except (json.JSONDecodeError, ValueError) as e:
                print(f"JSON parse error for coding question {answer.question_index}: {str(e)}")
                print(f"Response text: {eval_text[:500]}")  # Print first 500 chars
                # Fallback evaluation
                evaluation = {
                    "score": 50,
                    "correctness": "Code has syntax errors or incomplete implementation",
                    "code_quality": "Needs improvement",
                    "test_results": [],
                    "feedback": "The code appears incomplete or has errors. Please review the function signature and ensure proper implementation.",
                    "suggestions": ["Complete the function implementation", "Fix any syntax errors", "Test with provided test cases"]
                }

            coding_results.append({
                "question_index": answer.question_index,
                "question": question["question"],
                "user_code": answer.code,
                "score": evaluation["score"],
                "correctness": evaluation.get("correctness", ""),
                "code_quality": evaluation.get("code_quality", ""),
                "feedback": evaluation["feedback"],
                "suggestions": evaluation.get("suggestions", []),
                "topic": question.get("topic", "Coding"),
                "difficulty": question.get("difficulty", test.get("difficulty", "medium"))
            })

        # Evaluate reorder questions
        reorder_results = []
        for answer in request.reorder_answers:
            if answer.question_index >= len(test["reorder_questions"]):
                print(f"Warning: Reorder question index {answer.question_index} out of range")
                continue
            question = test["reorder_questions"][answer.question_index]
            correct_order = question["correct_order"]
            user_order = answer.ordered_items

            # Calculate score based on correct positions
            correct_count = sum(1 for i, item in enumerate(user_order) if i < len(correct_order) and item == correct_order[i])
            score = (correct_count / len(correct_order)) * 100

            reorder_results.append({
                "question_index": answer.question_index,
                "question": question["question"],
                "user_order": user_order,
                "correct_order": correct_order,
                "score": score,
                "correct_positions": correct_count,
                "total_items": len(correct_order),
                "topic": question.get("topic", "General"),
                "difficulty": question.get("difficulty", test.get("difficulty", "medium"))
            })

        # Calculate overall score with difficulty-based weighting
        # Difficulty weights: easy=1.0, medium=1.5, hard=2.0
        def get_difficulty_weight(difficulty):
            weights = {
                "easy": 1.0,
                "medium": 1.5,
                "hard": 2.0
            }
            return weights.get(difficulty.lower() if difficulty else "medium", 1.5)

        all_results = theory_results + coding_results + reorder_results
        if all_results:
            weighted_sum = sum(r["score"] * get_difficulty_weight(r.get("difficulty", "medium")) for r in all_results)
            total_weight = sum(get_difficulty_weight(r.get("difficulty", "medium")) for r in all_results)
            overall_score = weighted_sum / total_weight if total_weight > 0 else 0
        else:
            overall_score = 0

        print(f"Evaluation complete. Overall score: {overall_score:.1f}%")

        # Topic-wise performance
        topic_performance = {}
        for result in theory_results + coding_results + reorder_results:
            topic = result["topic"]
            if topic not in topic_performance:
                topic_performance[topic] = {"scores": [], "count": 0}
            topic_performance[topic]["scores"].append(result["score"])
            topic_performance[topic]["count"] += 1

        for topic in topic_performance:
            scores = topic_performance[topic]["scores"]
            topic_performance[topic]["average"] = sum(scores) / len(scores)

        # Generate overall analysis with weighted averages
        if all_results:
            # Calculate weighted averages for each question type
            if theory_results:
                theory_weighted_sum = sum(r['score'] * get_difficulty_weight(r.get('difficulty', 'medium')) for r in theory_results)
                theory_total_weight = sum(get_difficulty_weight(r.get('difficulty', 'medium')) for r in theory_results)
                theory_avg = theory_weighted_sum / theory_total_weight if theory_total_weight > 0 else 0
            else:
                theory_avg = 0

            if coding_results:
                coding_weighted_sum = sum(r['score'] * get_difficulty_weight(r.get('difficulty', 'medium')) for r in coding_results)
                coding_total_weight = sum(get_difficulty_weight(r.get('difficulty', 'medium')) for r in coding_results)
                coding_avg = coding_weighted_sum / coding_total_weight if coding_total_weight > 0 else 0
            else:
                coding_avg = 0

            if reorder_results:
                reorder_weighted_sum = sum(r['score'] * get_difficulty_weight(r.get('difficulty', 'medium')) for r in reorder_results)
                reorder_total_weight = sum(get_difficulty_weight(r.get('difficulty', 'medium')) for r in reorder_results)
                reorder_avg = reorder_weighted_sum / reorder_total_weight if reorder_total_weight > 0 else 0
            else:
                reorder_avg = 0

            analysis_prompt = f"""Provide a comprehensive performance analysis for this mock test:

Overall Score: {overall_score:.1f}%

Theory Questions Performance: {theory_avg:.1f}% ({len(theory_results)} questions)
Coding Questions Performance: {coding_avg:.1f}% ({len(coding_results)} questions)
Reordering Performance: {reorder_avg:.1f}% ({len(reorder_results)} questions)

Topic Performance:
{json.dumps(topic_performance, indent=2)}

Provide:
1. Overall assessment (2-3 sentences)
2. Strengths demonstrated
3. Areas needing improvement
4. Specific study recommendations
5. Next steps for preparation

Keep it encouraging but honest and actionable."""

            try:
                analysis_completion = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": analysis_prompt}],
                    model="llama-3.3-70b-versatile",
                    temperature=0.7,
                    max_tokens=1000
                )
                overall_analysis = analysis_completion.choices[0].message.content
            except Exception as e:
                print(f"Error generating overall analysis: {str(e)}")
                overall_analysis = f"Overall Score: {overall_score:.1f}%. You completed {len(all_results)} questions. Review the detailed feedback for each question to improve."
        else:
            overall_analysis = "No questions were answered. Please complete the test and submit again."

        # Type-specific averages are already calculated above with weighted scoring
        # No need to recalculate here - using the weighted averages from the analysis section

        # Save mock test result to database
        mock_test_result = {
            "user_id": test["user_id"],
            "notebook_id": test["notebook_id"],
            "test_id": request.test_id,
            "overall_score": overall_score,
            "theory_avg": theory_avg,
            "coding_avg": coding_avg,
            "reorder_avg": reorder_avg,
            "theory_results": theory_results,
            "coding_results": coding_results,
            "reorder_results": reorder_results,
            "topic_performance": topic_performance,
            "overall_analysis": overall_analysis,
            "total_questions": len(theory_results) + len(coding_results) + len(reorder_results),
            "difficulty": test.get("difficulty", "medium"),
            "programming_language": test.get("programming_language", "python"),
            "created_at": datetime.now().isoformat()
        }
        await mock_test_results_collection.insert_one(mock_test_result)

        return {
            "test_id": request.test_id,
            "overall_score": overall_score,
            "theory_results": theory_results,
            "coding_results": coding_results,
            "reorder_results": reorder_results,
            "topic_performance": topic_performance,
            "overall_analysis": overall_analysis,
            "total_questions": len(theory_results) + len(coding_results) + len(reorder_results)
        }

    except json.JSONDecodeError as e:
        print(f"JSON decode error in mock test submission: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse test data: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error submitting mock test: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error evaluating test: {str(e)}")

@app.get("/mock-test-history/{notebook_id}")
async def get_mock_test_history(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get all mock test attempts for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Fetch all mock test results for this notebook
        test_results = []
        async for result in mock_test_results_collection.find(
            {"notebook_id": notebook_id}
        ).sort("created_at", -1):  # Most recent first
            # Remove MongoDB _id for JSON serialization
            result.pop("_id", None)
            test_results.append(result)

        return {
            "notebook_id": notebook_id,
            "total_tests": len(test_results),
            "test_history": test_results
        }

    except HTTPException:
        raise
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
        elif request.note_type == "quiz":
            prompt = f"""Create a multiple choice quiz from the following content and return it as a JSON array.

{context}

Return ONLY a valid JSON array of quiz questions. Each question should have this exact structure:
[
  {{
    "question": "Question text here?",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctAnswer": 0,
    "explanation": "Brief explanation of the correct answer"
  }}
]

Important:
- correctAnswer is the index (0 for A, 1 for B, 2 for C, 3 for D)
- Create 5-8 questions
- Return ONLY valid JSON, no other text or markdown
- Make questions challenging and test understanding of key concepts"""
            ai_note_type = "ai_quiz"
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

        # Clean up quiz JSON if needed (remove markdown code blocks)
        if ai_note_type == "ai_quiz":
            # Remove markdown code blocks like ```json ... ``` or ``` ... ```
            generated_content = re.sub(r'^```(?:json)?\s*\n', '', generated_content, flags=re.MULTILINE)
            generated_content = re.sub(r'\n```\s*$', '', generated_content, flags=re.MULTILINE)
            generated_content = generated_content.strip()

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

        # Clear quizzes store
        quizzes_store.clear()

        # Clear mock tests store
        mock_tests_store.clear()

        return {"message": "All documents cleared successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== VIRTUAL INTERVIEW ENDPOINTS ====================

class InterviewStartRequest(BaseModel):
    notebook_id: str
    document_ids: Optional[List[str]] = None  # specific document IDs to focus on
    interview_type: str  # technical, behavioral, mixed
    difficulty: str  # easy, medium, hard
    duration: int  # in minutes
    page_numbers: Optional[List[int]] = None  # Limit to specific pages (for reading progress)

class InterviewRespondRequest(BaseModel):
    session_id: str
    user_response: str

class InterviewEndRequest(BaseModel):
    session_id: str

@app.post("/interview/start")
async def start_interview(request: InterviewStartRequest, current_user: TokenData = Depends(get_current_user)):
    """Start a new interview session"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        session_id = str(uuid.uuid4())

        # Get relevant content from documents using Pinecone
        print(f"[Interview Start] Notebook ID: {request.notebook_id}, Document IDs: {request.document_ids}, Page Numbers: {request.page_numbers}")

        # Build filter for Pinecone query
        filter_dict = {"notebook_id": request.notebook_id}
        if request.document_ids:
            filter_dict["doc_id"] = {"$in": request.document_ids}
        if request.page_numbers:
            filter_dict["page_number"] = {"$in": request.page_numbers}

        # Get diverse chunks from documents
        all_chunks = []
        num_queries = 10  # Get diverse content for interview context

        for _ in range(num_queries):
            random_text = f"interview {random.randint(1, 10000)}"
            query_embedding = embedding_model.encode(random_text).tolist()

            results = index.query(
                vector=query_embedding,
                top_k=3,
                include_metadata=True,
                filter=filter_dict
            )

            for match in results.matches:
                if match.metadata['text'] not in [c['text'] for c in all_chunks]:
                    all_chunks.append({
                        'text': match.metadata['text'],
                        'filename': match.metadata.get('filename', 'Unknown')
                    })

        # Build context from retrieved chunks
        document_context = ""
        if all_chunks:
            # Group by filename for organized context
            from collections import defaultdict
            chunks_by_file = defaultdict(list)
            for chunk in all_chunks[:15]:  # Limit to 15 chunks
                chunks_by_file[chunk['filename']].append(chunk['text'])

            doc_summaries = []
            for filename, texts in chunks_by_file.items():
                content_preview = " ".join(texts[:2])[:300]
                doc_summaries.append(f"- {filename}: {content_preview}...")

            if doc_summaries:
                document_context = f"\n\nThe candidate has been studying the following materials:\n" + "\n".join(doc_summaries) + "\n\nUse this context to ask relevant interview questions related to these topics."
                print(f"[Interview Start] Document context built from {len(all_chunks)} chunks across {len(chunks_by_file)} documents")

        # Generate initial greeting and first question based on interview type
        if request.interview_type == "technical":
            context_prompt = "You are conducting a technical interview. Focus on coding, algorithms, data structures, and technical problem-solving."
        elif request.interview_type == "behavioral":
            context_prompt = "You are conducting a behavioral interview. Focus on past experiences, teamwork, leadership, and soft skills."
        else:  # mixed
            context_prompt = "You are conducting a comprehensive interview covering both technical skills and behavioral aspects."

        difficulty_desc = {
            "easy": "Ask entry-level questions suitable for beginners.",
            "medium": "Ask intermediate-level questions for experienced candidates.",
            "hard": "Ask advanced questions for senior-level positions."
        }

        system_prompt = f"""You are an AI interviewer for a job interview simulation. {context_prompt}
{difficulty_desc.get(request.difficulty, '')}
{document_context}

Guidelines:
1. Be professional and friendly
2. Ask one question at a time
3. Listen to the candidate's response and ask relevant follow-up questions
4. The interview will last approximately {request.duration} minutes
5. Start with an introduction and ask the first question
6. Keep questions concise and clear
7. Adapt your questions based on the candidate's responses
8. Base your questions on the topics covered in the candidate's study materials when relevant

Start the interview with a friendly introduction and ask your first question."""

        # Generate initial message
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{
                "role": "system",
                "content": system_prompt
            }],
            temperature=0.7,
            max_tokens=300
        )

        initial_message = completion.choices[0].message.content

        # Create session in database
        session_data = {
            "session_id": session_id,
            "user_id": current_user.user_id,
            "notebook_id": request.notebook_id,
            "document_ids": request.document_ids,
            "page_numbers": request.page_numbers,
            "interview_type": request.interview_type,
            "difficulty": request.difficulty,
            "duration": request.duration,
            "messages": [{
                "role": "interviewer",
                "content": initial_message,
                "timestamp": datetime.utcnow()
            }],
            "status": "active",
            "created_at": datetime.utcnow()
        }

        await interview_sessions_collection.insert_one(session_data)

        return {
            "session_id": session_id,
            "initial_message": initial_message
        }

    except Exception as e:
        print(f"Error starting interview: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/interview/respond")
async def respond_to_interview(request: InterviewRespondRequest, current_user: TokenData = Depends(get_current_user)):
    """Send user response and get next question"""
    try:
        # Get session from database
        session = await interview_sessions_collection.find_one({"session_id": request.session_id})

        if not session:
            raise HTTPException(status_code=404, detail="Interview session not found")

        # Verify session ownership
        if session.get("user_id") != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Add user response to messages
        session["messages"].append({
            "role": "user",
            "content": request.user_response,
            "timestamp": datetime.utcnow()
        })

        # Get document context if available
        document_context = ""
        document_ids = session.get("document_ids")

        print(f"[Interview] Session document_ids: {document_ids}")

        if document_ids:
            documents = []
            async for doc in documents_collection.find({
                "notebook_id": session["notebook_id"],
                "doc_id": {"$in": document_ids}
            }):
                documents.append(doc)

            print(f"[Interview] Found {len(documents)} documents for context")

            if documents:
                doc_summaries = []
                for doc in documents[:5]:
                    filename = doc.get("filename", "Unknown")
                    chunks = doc.get("chunks", [])[:3]
                    content_preview = " ".join(chunks[:2]) if chunks else ""
                    if content_preview:
                        doc_summaries.append(f"- {filename}: {content_preview[:200]}...")

                if doc_summaries:
                    document_context = f"\n\nThe candidate has been studying these materials:\n" + "\n".join(doc_summaries) + "\n\nBase your questions on these topics."
                    print(f"[Interview] Document context built with {len(doc_summaries)} document summaries")

        # Build conversation history for context
        conversation_messages = []

        # System prompt
        if session["interview_type"] == "technical":
            context_prompt = "You are conducting a technical interview. Focus on coding, algorithms, and problem-solving."
        elif session["interview_type"] == "behavioral":
            context_prompt = "You are conducting a behavioral interview. Focus on experiences and soft skills."
        else:
            context_prompt = "You are conducting a comprehensive interview."

        conversation_messages.append({
            "role": "system",
            "content": f"""{context_prompt}
{document_context}

Continue the interview by:
1. Acknowledging the candidate's response briefly
2. Asking a relevant follow-up question based on their study materials, or moving to a new topic if needed
3. Keep your response concise (2-3 sentences max)
4. Be professional and encouraging
5. Ensure questions are related to the topics in their uploaded documents"""
        })

        # Add conversation history (last 8 messages for context)
        for msg in session["messages"][-8:]:
            conversation_messages.append({
                "role": "assistant" if msg["role"] == "interviewer" else "user",
                "content": msg["content"]
            })

        # Generate next question
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=conversation_messages,
            temperature=0.7,
            max_tokens=300
        )

        next_question = completion.choices[0].message.content

        # Add interviewer response to messages
        session["messages"].append({
            "role": "interviewer",
            "content": next_question,
            "timestamp": datetime.utcnow()
        })

        # Update session in database
        await interview_sessions_collection.update_one(
            {"session_id": request.session_id},
            {"$set": {"messages": session["messages"]}}
        )

        return {"next_question": next_question}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error responding to interview: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/interview/end")
async def end_interview(request: InterviewEndRequest, current_user: TokenData = Depends(get_current_user)):
    """End interview session and generate scoring"""
    try:
        # Get session from database
        session = await interview_sessions_collection.find_one({"session_id": request.session_id})

        if not session:
            raise HTTPException(status_code=404, detail="Interview session not found")

        # Verify session ownership
        if session.get("user_id") != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Build transcript for analysis
        transcript = []
        for msg in session["messages"]:
            role = "Interviewer" if msg["role"] == "interviewer" else "Candidate"
            transcript.append(f"{role}: {msg['content']}")

        transcript_text = "\n\n".join(transcript)

        # Generate scoring and feedback using AI
        scoring_prompt = f"""Analyze this job interview transcript and provide detailed scoring and feedback.

Interview Type: {session["interview_type"]}
Difficulty: {session["difficulty"]}

TRANSCRIPT:
{transcript_text}

Provide a JSON response with the following structure:
{{
    "overall_score": <0-100>,
    "communication_score": <0-100>,
    "technical_score": <0-100>,
    "problem_solving_score": <0-100>,
    "strengths": ["strength1", "strength2", "strength3"],
    "improvements": ["area1", "area2", "area3"],
    "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
}}

Evaluate based on:
1. Communication: Clarity, articulation, professionalism
2. Technical Knowledge: Understanding of concepts, depth of answers
3. Problem Solving: Analytical thinking, approach to questions
4. Refusal to answer, or no answer of the user will result in 0 marks. Be pretty strict.
5. Overall: Holistic performance assessment

Be constructive and specific in your feedback."""

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{
                "role": "user",
                "content": scoring_prompt
            }],
            temperature=0.5,
            max_tokens=1000
        )

        # Parse the scoring response
        scoring_text = completion.choices[0].message.content

        # Extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', scoring_text)
        if json_match:
            scoring_data = json.loads(json_match.group())
        else:
            # Fallback scoring if parsing fails
            scoring_data = {
                "overall_score": 75,
                "communication_score": 75,
                "technical_score": 70,
                "problem_solving_score": 75,
                "strengths": ["Participated actively", "Showed engagement", "Attempted all questions"],
                "improvements": ["Practice more technical concepts", "Provide more detailed examples", "Work on time management"],
                "recommendations": ["Study common interview questions", "Practice mock interviews", "Review fundamental concepts"]
            }

        # Update session status
        await interview_sessions_collection.update_one(
            {"session_id": request.session_id},
            {
                "$set": {
                    "status": "completed",
                    "score": scoring_data,
                    "completed_at": datetime.utcnow()
                }
            }
        )

        return {
            "score": scoring_data,
            "feedback": {
                "strengths": scoring_data.get("strengths", []),
                "improvements": scoring_data.get("improvements", []),
                "recommendations": scoring_data.get("recommendations", [])
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error ending interview: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/interview-history/{notebook_id}")
async def get_interview_history(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get all interview sessions for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Fetch all interview sessions for this notebook
        sessions = []
        async for session in interview_sessions_collection.find(
            {"notebook_id": notebook_id}
        ).sort("created_at", -1):  # Most recent first
            # Remove MongoDB _id for JSON serialization
            session.pop("_id", None)
            sessions.append(session)

        return {
            "notebook_id": notebook_id,
            "total_sessions": len(sessions),
            "interview_history": sessions
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ====================================
# Doomscroll Endpoints
# ====================================

class DoomscrollGenerateRequest(BaseModel):
    notebook_id: str
    count: int = 10

class DoomscrollLikeRequest(BaseModel):
    notebook_id: str
    card_id: str
    type: str
    title: str
    content: str
    example: Optional[str] = None
    color: str

class DoomscrollFolderCreate(BaseModel):
    notebook_id: str
    name: str

class DoomscrollMoveCardRequest(BaseModel):
    folder_id: Optional[str] = None

CARD_TYPES = ['fun_fact', 'mnemonic', 'key_concept', 'quote', 'summary', 'tip', 'question', 'definition']

def generate_card_with_llm(card_type: str, content: str, max_retries: int = 2) -> Optional[dict]:
    """Generate a doomscroll card using LLM"""

    prompts = {
        "fun_fact": """Extract ONE interesting, surprising, or little-known fact from this text. Make it engaging and memorable.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "Did you know?",
  "content": "The interesting fact in 1-2 sentences",
  "example": "Optional real-world application or context"
}}""",

        "mnemonic": """Create a mnemonic device to help remember key information from this text.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "Remember this!",
  "content": "The mnemonic device",
  "example": "Explanation of what each part means"
}}""",

        "key_concept": """Identify and explain ONE key concept from this text in simple, clear terms.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "The concept name (2-5 words)",
  "content": "Clear explanation in 2-3 sentences",
  "example": "A concrete example or application"
}}""",

        "quote": """Extract or create ONE important, memorable quote or key statement from this text.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "Key Insight",
  "content": "The quote or important statement",
  "example": "Why this is important or what it means"
}}""",

        "summary": """Create a brief, engaging summary of the main point from this text.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "In a nutshell",
  "content": "Concise summary in 2-3 sentences",
  "example": "Optional key takeaway"
}}""",

        "tip": """Extract ONE practical tip or advice from this text.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "Pro Tip",
  "content": "The practical tip or advice",
  "example": "How to apply it"
}}""",

        "question": """Create ONE thought-provoking question based on this text that encourages deeper thinking.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "Think about this",
  "content": "The thought-provoking question",
  "example": "Why this question matters or what it reveals"
}}""",

        "definition": """Provide a clear definition of ONE important term or concept from this text.

Text: {content}

Respond in this EXACT JSON format:
{{
  "title": "Definition: [Term]",
  "content": "Clear, simple definition",
  "example": "Usage example or analogy"
}}"""
    }

    if card_type not in prompts:
        return None

    prompt = prompts[card_type].format(content=content[:2000])  # Limit content length

    for attempt in range(max_retries):
        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a learning content creator. Always respond with valid JSON only, no markdown or extra text."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=500
            )

            response_text = response.choices[0].message.content.strip()

            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                response_text = re.sub(r'^```json?\s*', '', response_text)
                response_text = re.sub(r'\s*```$', '', response_text)

            # Parse JSON response
            card_data = json.loads(response_text)

            # Validate required fields
            if "title" in card_data and "content" in card_data:
                return {
                    "type": card_type,
                    "title": card_data["title"][:100],  # Limit title length
                    "content": card_data["content"][:500],  # Limit content length
                    "example": card_data.get("example", "")[:300] if card_data.get("example") else None
                }

        except json.JSONDecodeError as e:
            print(f"JSON decode error for {card_type} (attempt {attempt + 1}): {e}")
            print(f"Response was: {response_text}")
            if attempt == max_retries - 1:
                return None
            continue
        except Exception as e:
            print(f"Error generating {card_type} card (attempt {attempt + 1}): {e}")
            if attempt == max_retries - 1:
                return None
            continue

    return None

@app.post("/doomscroll/generate")
async def generate_doomscroll_cards(request: DoomscrollGenerateRequest, current_user: TokenData = Depends(get_current_user)):
    """Generate doomscroll cards from notebook documents"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Get all documents for the notebook
        documents = await documents_collection.find({
            "notebook_id": request.notebook_id
        }).to_list(length=None)

        if not documents:
            return {
                "cards": [],
                "message": "No documents found for this notebook"
            }

        # Collect all chunks from all documents
        all_chunks = []
        for doc in documents:
            chunks = await ensure_document_chunks(doc)
            all_chunks.extend(chunks)

        if not all_chunks:
            return {
                "cards": [],
                "message": "No content found in documents"
            }

        # Shuffle chunks for variety
        random.shuffle(all_chunks)

        # Generate diverse card types
        cards = []
        card_type_index = 0
        chunk_index = 0
        attempts = 0
        max_attempts = request.count * 3  # Allow up to 3 attempts per card

        while len(cards) < request.count and attempts < max_attempts and chunk_index < len(all_chunks):
            card_type = CARD_TYPES[card_type_index % len(CARD_TYPES)]
            chunk = all_chunks[chunk_index]

            # Generate card
            card = generate_card_with_llm(card_type, chunk)

            if card:
                cards.append(card)
                card_type_index += 1  # Move to next card type for variety

            chunk_index += 1
            attempts += 1

        # If we couldn't generate enough cards, that's ok, return what we have
        if len(cards) == 0:
            return {
                "cards": [],
                "message": "Could not generate cards from the content"
            }

        return {"cards": cards}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating doomscroll cards: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/doomscroll/like")
async def like_doomscroll_card(request: DoomscrollLikeRequest, current_user: TokenData = Depends(get_current_user)):
    """Save a doomscroll card"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Check if card is already saved
        existing = await saved_cards_collection.find_one({
            "notebook_id": request.notebook_id,
            "card_id": request.card_id
        })

        if existing:
            return {"success": True, "saved_card_id": str(existing["_id"]), "message": "Card already saved"}

        # Save the card
        card_doc = {
            "notebook_id": request.notebook_id,
            "card_id": request.card_id,
            "type": request.type,
            "title": request.title,
            "content": request.content,
            "example": request.example,
            "color": request.color,
            "folder_id": None,
            "created_at": datetime.utcnow()
        }

        result = await saved_cards_collection.insert_one(card_doc)

        return {
            "success": True,
            "saved_card_id": str(result.inserted_id)
        }

    except Exception as e:
        print(f"Error saving card: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/doomscroll/saved/{notebook_id}")
async def get_saved_cards(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get all saved cards for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        cards = await saved_cards_collection.find({
            "notebook_id": notebook_id
        }).sort("created_at", -1).to_list(length=None)

        # Convert ObjectId to string
        for card in cards:
            card["id"] = str(card["_id"])
            del card["_id"]

        return {"cards": cards}

    except Exception as e:
        print(f"Error fetching saved cards: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/doomscroll/saved/{notebook_id}/{card_id}")
async def delete_saved_card(notebook_id: str, card_id: str, current_user: TokenData = Depends(get_current_user)):
    """Delete a saved card"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        result = await saved_cards_collection.delete_one({
            "notebook_id": notebook_id,
            "card_id": card_id
        })

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Card not found")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting saved card: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/doomscroll/folders")
async def create_folder(request: DoomscrollFolderCreate, current_user: TokenData = Depends(get_current_user)):
    """Create a folder for organizing cards"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(request.notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        folder_doc = {
            "notebook_id": request.notebook_id,
            "name": request.name,
            "created_at": datetime.utcnow()
        }

        result = await doomscroll_folders_collection.insert_one(folder_doc)

        folder_doc["id"] = str(result.inserted_id)
        del folder_doc["_id"]

        return {"folder": folder_doc}

    except Exception as e:
        print(f"Error creating folder: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/doomscroll/folders/{notebook_id}")
async def get_folders(notebook_id: str, current_user: TokenData = Depends(get_current_user)):
    """Get all folders for a notebook"""
    try:
        # Verify notebook ownership
        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(notebook_id),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        folders = await doomscroll_folders_collection.find({
            "notebook_id": notebook_id
        }).sort("created_at", 1).to_list(length=None)

        # Convert ObjectId to string
        for folder in folders:
            folder["id"] = str(folder["_id"])
            del folder["_id"]

        return {"folders": folders}

    except Exception as e:
        print(f"Error fetching folders: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/doomscroll/folders/{folder_id}")
async def delete_folder(folder_id: str, current_user: TokenData = Depends(get_current_user)):
    """Delete a folder and move its cards to uncategorized"""
    try:
        # Verify folder ownership through notebook
        folder = await doomscroll_folders_collection.find_one({"_id": ObjectId(folder_id)})
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(folder["notebook_id"]),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        # Move all cards in this folder to uncategorized (folder_id = None)
        await saved_cards_collection.update_many(
            {"folder_id": folder_id},
            {"$set": {"folder_id": None}}
        )

        # Delete the folder
        result = await doomscroll_folders_collection.delete_one({
            "_id": ObjectId(folder_id)
        })

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Folder not found")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting folder: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/doomscroll/card/{card_id}/folder")
async def move_card_to_folder(card_id: str, request: DoomscrollMoveCardRequest, current_user: TokenData = Depends(get_current_user)):
    """Move a card to a folder"""
    try:
        # Verify card ownership through notebook
        card = await saved_cards_collection.find_one({"_id": ObjectId(card_id)})
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")

        notebook = await notebooks_collection.find_one({
            "_id": ObjectId(card["notebook_id"]),
            "user_id": current_user.user_id
        })
        if not notebook:
            raise HTTPException(status_code=403, detail="Access denied")

        # Update the card's folder_id
        result = await saved_cards_collection.update_one(
            {"_id": ObjectId(card_id)},
            {"$set": {"folder_id": request.folder_id}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Card not found")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error moving card: {str(e)}")
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
