
import sys
import traceback

print("Attempting to import main...")
try:
    from main import app
    print("Import successful!")
    print("Starting uvicorn...")
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
except Exception:
    print("Caught exception during import or startup:")
    traceback.print_exc()
