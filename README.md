# Blood Work Analyzer — React + FastAPI (enhanced)

## Features
- PDF upload and text extraction (text-based PDFs; scanned/image-only PDFs need OCR)
- Paste report text manually
- Keeps the original two-stage LLM flow: Stage 1 extracts and flags markers; Stage 2 produces the health summary and Indian diet plan
- Interactive Recharts bar chart with abnormal/all filters
- Summary metrics and extracted-marker table
- Downloadable PDF analysis report
- API key remains in the Python backend

## Requirements
- Node.js 20+
- Python 3.10+
- Groq API key for the model used in the supplied notebook

## Backend (PowerShell)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```
Set `GROQ_API_KEY` in `backend/.env`, then run:
```powershell
uvicorn main:app --reload --port 8000
```
Check `http://localhost:8000/api/health`.

## Frontend (second terminal)
```powershell
cd frontend
npm install
npm run dev
```
Open the local Vite URL, usually `http://localhost:5173`.

If you want to set the backend URL explicitly, copy `frontend/.env.example` to `frontend/.env`.

## PDF notes
The upload endpoint extracts selectable text with PyMuPDF. Scanned PDFs (images of pages) do not contain selectable text and will show an explanatory error; OCR can be added separately. Limit is 12 MB. PDF report generation uses ReportLab.

## Medical safety
This is an informational aid, not a diagnosis. LLM output and parsed marker values may be wrong. Reference ranges and interpretations should be verified with a qualified healthcare professional. Do not upload unnecessary personal identifiers. Restrict CORS origins and add authentication/rate limiting before public deployment.
