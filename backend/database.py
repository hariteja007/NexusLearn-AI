"""
Database Configuration Module
=============================
This module handles all MongoDB database connections and collection definitions
for the Nexus Learn application.

The application uses MongoDB for persistent storage of:
- Notebooks and documents
- Quiz and mock test results
- Chat history and notes
- PDF annotations
- Interview sessions and learning cards
- Reading progress and bookmarks
"""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# MongoDB Configuration
# =====================
# MongoDB connection URL - defaults to local instance if not specified
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = "NexusLearn"

# Async MongoDB Client
# ====================
# Motor async client used for FastAPI async endpoints
# This allows non-blocking database operations in async routes
async_client = AsyncIOMotorClient(MONGODB_URL)
async_db = async_client[DATABASE_NAME]

# Sync MongoDB Client
# ===================
# PyMongo sync client used only for database initialization and index creation
# Sync operations are acceptable during startup but not during request handling
sync_client = MongoClient(MONGODB_URL)
sync_db = sync_client[DATABASE_NAME]

# MongoDB Collections
# ===================
# All collections use the async database client for non-blocking operations

# Users: Store user accounts and authentication data
users_collection = async_db["users"]

# Notebooks: Store user-created notebooks with metadata (name, color, icon)
notebooks_collection = async_db["notebooks"]

# Documents: Store uploaded PDF documents and their metadata
documents_collection = async_db["documents"]

# Quiz Results: Store quiz attempts, answers, and scores
quiz_results_collection = async_db["quiz_results"]

# Mock Test Results: Store mock test attempts and performance data
mock_test_results_collection = async_db["mock_test_results"]

# Chat History: Store conversation history between user and AI
chat_history_collection = async_db["chat_history"]

# Notes: Store user-created notes with rich text content
notes_collection = async_db["notes"]

# Annotations: Store PDF annotations (highlights, comments, etc.)
annotations_collection = async_db["annotations"]

# Interview Sessions: Store virtual interview practice sessions
interview_sessions_collection = async_db["interview_sessions"]

# Saved Cards: Store user-favorited learning cards from doomscroll feature
saved_cards_collection = async_db["saved_cards"]

# Doomscroll Folders: Store organization folders for saved learning cards
doomscroll_folders_collection = async_db["doomscroll_folders"]

# Analysis Cache: Store cached PDF/document analysis results for cost optimization
analysis_cache_collection = async_db["analysis_cache"]

# PDF Questions: Store generated questions from PDF analysis with mark types
pdf_questions_collection = async_db["pdf_questions"]

# Reading Progress: Store user reading progress for documents (page tracking)
reading_progress_collection = async_db["reading_progress"]

# Bookmarks: Store user bookmarks for specific pages in documents
bookmarks_collection = async_db["bookmarks"]

# Database Initialization
# =======================

def init_db():
    """
    Initialize database indexes for optimal query performance.

    This function creates indexes on frequently queried fields across all collections.
    Indexes significantly improve query performance for filtering and sorting operations.

    Called once during application startup.

    Raises:
        Exception: If index creation fails (logged but doesn't crash the application)
    """
    try:
        # Users indexes
        sync_db["users"].create_index("email", unique=True)
        sync_db["users"].create_index("created_at")

        # Notebooks indexes
        sync_db["notebooks"].create_index("user_id")
        sync_db["notebooks"].create_index("created_at")

        # Documents indexes
        sync_db["documents"].create_index("notebook_id")
        sync_db["documents"].create_index([("notebook_id", 1), ("filename", 1)])

        # Quiz results indexes
        sync_db["quiz_results"].create_index("notebook_id")
        sync_db["quiz_results"].create_index("created_at")

        # Mock test results indexes
        sync_db["mock_test_results"].create_index("notebook_id")
        sync_db["mock_test_results"].create_index("created_at")

        # Chat history indexes
        sync_db["chat_history"].create_index("notebook_id")
        sync_db["chat_history"].create_index("created_at")

        # Notes indexes
        sync_db["notes"].create_index("notebook_id")
        sync_db["notes"].create_index("created_at")

        # Annotations indexes
        sync_db["annotations"].create_index("notebook_id")
        sync_db["annotations"].create_index("document_id")
        sync_db["annotations"].create_index("created_at")

        # Interview sessions indexes
        sync_db["interview_sessions"].create_index("notebook_id")
        sync_db["interview_sessions"].create_index("session_id")
        sync_db["interview_sessions"].create_index("created_at")

        # Saved cards indexes
        sync_db["saved_cards"].create_index("notebook_id")
        sync_db["saved_cards"].create_index("card_id")
        sync_db["saved_cards"].create_index([("notebook_id", 1), ("card_id", 1)])
        sync_db["saved_cards"].create_index("created_at")

        # Doomscroll folders indexes
        sync_db["doomscroll_folders"].create_index("notebook_id")
        sync_db["doomscroll_folders"].create_index("created_at")

        # Analysis cache indexes
        sync_db["analysis_cache"].create_index("document_id")
        sync_db["analysis_cache"].create_index([("document_id", 1), ("page_number", 1)])
        sync_db["analysis_cache"].create_index([("document_id", 1), ("custom_prompt_hash", 1)])
        sync_db["analysis_cache"].create_index("created_at", expireAfterSeconds=2592000)  # 30 days TTL

        # PDF questions indexes
        sync_db["pdf_questions"].create_index("document_id")
        sync_db["pdf_questions"].create_index("notebook_id")
        sync_db["pdf_questions"].create_index([("document_id", 1), ("page_number", 1)])
        sync_db["pdf_questions"].create_index("created_at")

        # Reading progress indexes
        sync_db["reading_progress"].create_index([("user_id", 1), ("document_id", 1)], unique=True)
        sync_db["reading_progress"].create_index("notebook_id")
        sync_db["reading_progress"].create_index("updated_at")
        sync_db["reading_progress"].create_index("last_read_at")

        # Bookmarks indexes
        sync_db["bookmarks"].create_index([("user_id", 1), ("document_id", 1)])
        sync_db["bookmarks"].create_index("notebook_id")
        sync_db["bookmarks"].create_index([("document_id", 1), ("page_number", 1)])
        sync_db["bookmarks"].create_index("created_at")

        print("Database indexes initialized successfully")
    except Exception as e:
        print(f"Error initializing database: {e}")

async def close_db():
    """
    Gracefully close all database connections.

    Should be called during application shutdown to properly release
    database connection resources and prevent connection leaks.

    This is an async function to maintain consistency with the async client,
    though both clients support synchronous closing.
    """
    async_client.close()
    sync_client.close()
