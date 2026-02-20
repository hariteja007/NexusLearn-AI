import re
from typing import Any, Dict, List
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import yt_dlp
from .base_processor import BaseProcessor


class YouTubeProcessor(BaseProcessor):
    """Processor for YouTube videos"""

    def __init__(self):
        self.video_id = None
        self.video_url = None
        self.transcript_data = []

    def extract_video_id(self, url: str) -> str:
        """
        Extract YouTube video ID from URL

        Args:
            url: YouTube URL

        Returns:
            Video ID string
        """
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)',
            r'youtube\.com\/embed\/([^&\n?#]+)',
            r'youtube\.com\/v\/([^&\n?#]+)'
        ]

        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)

        raise ValueError(f"Could not extract video ID from URL: {url}")

    def extract_text(self, url: str) -> str:
        """
        Extract transcript text from YouTube video

        Args:
            url: YouTube video URL

        Returns:
            Transcript text as string
        """
        try:
            self.video_url = url
            self.video_id = self.extract_video_id(url)

            # Get transcript list
            transcript_list = YouTubeTranscriptApi.list_transcripts(self.video_id)

            # Try to find transcript in preferred order: manual English, generated English, any available
            try:
                transcript = transcript_list.find_transcript(['en', 'en-US', 'en-GB'])
            except:
                # If no English transcript, get the first available one
                try:
                    transcript = next(iter(transcript_list))
                except StopIteration:
                    raise Exception("No transcripts found for this video")

            # Fetch the actual transcript data
            transcript_data = transcript.fetch()

            # Convert transcript snippets to dictionaries for storage
            self.transcript_data = [
                {
                    'text': entry.text,
                    'start': entry.start,
                    'duration': entry.duration
                }
                for entry in transcript_data
            ]

            # Combine all transcript text
            text_parts = [entry.text for entry in transcript_data]
            return ' '.join(text_parts).strip()

        except (TranscriptsDisabled, NoTranscriptFound) as e:
            raise Exception(f"No transcript available for this video: {str(e)}")
        except Exception as e:
            raise Exception(f"Failed to extract transcript: {str(e)}")

    def get_file_type(self) -> str:
        """Get the file type this processor handles"""
        return "youtube"

    def get_transcript_with_timestamps(self) -> List[Dict[str, Any]]:
        """
        Get full transcript with timestamp information

        Returns:
            List of transcript entries with start time, duration, and text
        """
        return self.transcript_data

    def get_metadata(self, url: str) -> Dict[str, Any]:
        """
        Extract metadata from YouTube video

        Args:
            url: YouTube video URL

        Returns:
            Dictionary containing video metadata
        """
        metadata = {
            "file_type": "youtube",
            "source_url": url
        }

        try:
            video_id = self.extract_video_id(url)
            metadata["video_id"] = video_id

            # Use yt-dlp to get video metadata
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                if info:
                    metadata["title"] = info.get("title", "")
                    metadata["duration"] = info.get("duration", 0)  # Duration in seconds
                    metadata["author"] = info.get("uploader", "")
                    metadata["channel_id"] = info.get("channel_id", "")
                    metadata["upload_date"] = info.get("upload_date", "")
                    metadata["view_count"] = info.get("view_count", 0)
                    metadata["thumbnail"] = info.get("thumbnail", "")
                    metadata["description"] = info.get("description", "")

            # Get transcript data
            try:
                # Get transcript list
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

                # Try to find any available transcript
                try:
                    transcript = transcript_list.find_transcript(['en', 'en-US', 'en-GB'])
                except:
                    try:
                        transcript = next(iter(transcript_list))
                    except StopIteration:
                        transcript = None

                transcript_data = transcript.fetch()

                # Convert transcript snippets to dictionaries
                self.transcript_data = [
                    {
                        'text': entry.text,
                        'start': entry.start,
                        'duration': entry.duration
                    }
                    for entry in transcript_data
                ]

                metadata["has_transcript"] = True
                metadata["transcript_length"] = len(self.transcript_data)
            except:
                metadata["has_transcript"] = False

        except Exception as e:
            metadata["error"] = str(e)

        return metadata
