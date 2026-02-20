# Hugging Face Spaces entry point
import os
os.chdir('/home/user/app/backend')

# Now import and run the main app
from main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
