from abc import ABC, abstractmethod
from typing import Dict, Any, List


class BaseProcessor(ABC):
    """Base class for all document processors"""

    @abstractmethod
    def extract_text(self, file_path_or_content: Any) -> str:
        """
        Extract text content from the document

        Args:
            file_path_or_content: Either a file path or file content depending on processor type

        Returns:
            Extracted text as string
        """
        pass

    @abstractmethod
    def get_file_type(self) -> str:
        """
        Get the file type this processor handles

        Returns:
            File type string (e.g., 'pdf', 'txt', 'docx', 'youtube')
        """
        pass

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """
        Split text into overlapping chunks

        Args:
            text: The text to chunk
            chunk_size: Size of each chunk in characters
            overlap: Number of overlapping characters between chunks

        Returns:
            List of text chunks
        """
        chunks = []
        start = 0
        text_length = len(text)

        while start < text_length:
            end = start + chunk_size
            chunk = text[start:end]

            if chunk.strip():
                chunks.append(chunk)

            start += chunk_size - overlap

            if start >= text_length:
                break

        return chunks

    def get_metadata(self, file_path_or_content: Any) -> Dict[str, Any]:
        """
        Extract metadata from the document

        Args:
            file_path_or_content: Either a file path or file content

        Returns:
            Dictionary containing metadata
        """
        return {}
