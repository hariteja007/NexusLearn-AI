import os
from typing import Any, Dict
from striprtf.striprtf import rtf_to_text
from .base_processor import BaseProcessor


class TextProcessor(BaseProcessor):
    """Processor for text-based documents (.txt, .md, .rtf)"""

    def __init__(self, file_extension: str):
        """
        Initialize TextProcessor with specific file extension

        Args:
            file_extension: File extension (txt, md, rtf)
        """
        self.file_extension = file_extension.lower().replace('.', '')

    def extract_text(self, file_path_or_content: Any) -> str:
        """
        Extract text content from text-based files

        Args:
            file_path_or_content: File path or file-like object

        Returns:
            Text content as string
        """
        # Handle file-like objects
        if hasattr(file_path_or_content, 'read'):
            content = file_path_or_content.read()
            if isinstance(content, bytes):
                content = content.decode('utf-8', errors='ignore')
            file_path_or_content.seek(0)  # Reset file pointer
        elif isinstance(file_path_or_content, str):
            # Handle file paths
            with open(file_path_or_content, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        else:
            raise ValueError("Input must be a file path or file-like object")

        # Process based on file type
        if self.file_extension == 'rtf':
            try:
                text = rtf_to_text(content)
                return text.strip()
            except Exception as e:
                # If RTF parsing fails, return raw content
                return content.strip()
        else:
            # For .txt and .md, return content as-is
            return content.strip()

    def get_file_type(self) -> str:
        """Get the file type this processor handles"""
        return self.file_extension

    def get_metadata(self, file_path_or_content: Any) -> Dict[str, Any]:
        """
        Extract metadata from text file

        Args:
            file_path_or_content: File path or file-like object

        Returns:
            Dictionary containing file metadata
        """
        metadata = {
            "file_type": self.file_extension
        }

        try:
            text = self.extract_text(file_path_or_content)
            metadata["char_count"] = len(text)
            metadata["word_count"] = len(text.split())
            metadata["line_count"] = len(text.split('\n'))

            # For markdown files, try to extract title from first heading
            if self.file_extension == 'md':
                lines = text.split('\n')
                for line in lines:
                    if line.strip().startswith('#'):
                        metadata["title"] = line.strip().lstrip('#').strip()
                        break

        except Exception as e:
            metadata["error"] = str(e)

        return metadata
