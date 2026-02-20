import PyPDF2
from typing import Any, Dict
from .base_processor import BaseProcessor


class PDFProcessor(BaseProcessor):
    """Processor for PDF documents"""

    def extract_text(self, file_path_or_content: Any) -> str:
        """
        Extract all text content from a PDF file.

        Args:
            file_path_or_content: File-like object or path to PDF

        Returns:
            Concatenated text from all pages
        """
        pdf_reader = PyPDF2.PdfReader(file_path_or_content)
        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()

    def extract_text_with_pages(self, file_path_or_content: Any):
        """
        Extract text from PDF page-by-page for page-based chunking.

        Args:
            file_path_or_content: File-like object or path to PDF

        Returns:
            List of tuples: [(page_number, page_text), ...]
            page_number is 1-indexed
        """
        pdf_reader = PyPDF2.PdfReader(file_path_or_content)
        pages_data = []

        for page_num, page in enumerate(pdf_reader.pages, start=1):
            page_text = page.extract_text()
            if page_text and page_text.strip():
                pages_data.append((page_num, page_text.strip()))

        return pages_data

    def get_file_type(self) -> str:
        """Get the file type this processor handles"""
        return "pdf"

    def get_metadata(self, file_path_or_content: Any) -> Dict[str, Any]:
        """
        Extract metadata from PDF

        Args:
            file_path_or_content: File-like object or path to PDF

        Returns:
            Dictionary containing PDF metadata
        """
        try:
            pdf_reader = PyPDF2.PdfReader(file_path_or_content)
            metadata = {
                "num_pages": len(pdf_reader.pages),
                "file_type": "pdf"
            }

            # Extract PDF info if available
            if pdf_reader.metadata:
                info = pdf_reader.metadata
                if info.get("/Title"):
                    metadata["title"] = info.get("/Title")
                if info.get("/Author"):
                    metadata["author"] = info.get("/Author")
                if info.get("/Subject"):
                    metadata["subject"] = info.get("/Subject")

            return metadata
        except Exception as e:
            return {"file_type": "pdf", "error": str(e)}
