import os
import tempfile
from typing import Any, Dict
from .base_processor import BaseProcessor

# Try to import textract, but make it optional since it has installation issues
try:
    import textract
    TEXTRACT_AVAILABLE = True
except ImportError:
    TEXTRACT_AVAILABLE = False


class LegacyWordProcessor(BaseProcessor):
    """Processor for legacy Word documents (.doc)"""

    def extract_text(self, file_path_or_content: Any) -> str:
        """
        Extract text content from .doc file using textract

        Args:
            file_path_or_content: File path or file-like object

        Returns:
            Extracted text as string
        """
        if not TEXTRACT_AVAILABLE:
            raise Exception(
                "Legacy Word (.doc) file processing requires the 'textract' library, "
                "which is not installed. Please use .docx format instead, or download the file directly."
            )

        try:
            # textract needs a file path, so handle file-like objects
            if hasattr(file_path_or_content, 'read'):
                # Create temporary file
                with tempfile.NamedTemporaryFile(delete=False, suffix='.doc') as tmp_file:
                    tmp_file.write(file_path_or_content.read())
                    tmp_file_path = tmp_file.name
                    file_path_or_content.seek(0)  # Reset file pointer

                try:
                    text = textract.process(tmp_file_path).decode('utf-8', errors='ignore')
                    return text.strip()
                finally:
                    # Clean up temp file
                    if os.path.exists(tmp_file_path):
                        os.remove(tmp_file_path)
            else:
                # It's a file path
                text = textract.process(file_path_or_content).decode('utf-8', errors='ignore')
                return text.strip()

        except Exception as e:
            raise Exception(f"Failed to extract text from .doc file: {str(e)}")

    def get_file_type(self) -> str:
        """Get the file type this processor handles"""
        return "doc"

    def get_metadata(self, file_path_or_content: Any) -> Dict[str, Any]:
        """
        Extract metadata from .doc file

        Args:
            file_path_or_content: File path or file-like object

        Returns:
            Dictionary containing file metadata
        """
        metadata = {
            "file_type": "doc"
        }

        try:
            text = self.extract_text(file_path_or_content)
            metadata["word_count"] = len(text.split())
            metadata["char_count"] = len(text)

        except Exception as e:
            metadata["error"] = str(e)

        return metadata
