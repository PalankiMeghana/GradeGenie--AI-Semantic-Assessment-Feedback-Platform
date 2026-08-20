# GradeGenie

AI-powered semantic grading tool for student answers. Matches student responses against rubric concepts using sentence embeddings and NLI, then returns grades and concept-level feedback.

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Flask, Sentence Transformers

## Project Structure
GradeGenie/ ├── front-end/project/ # React UI ├── new-backend/ # Flask API + rubrics └── training_data.jsonl # Sample Q&A data (optional)

## Prerequisites
- Node.js 18+
- Python 3.10+
- (Optional) Tesseract OCR and Poppler for PDF/image uploads
## Setup
### Backend
```bash
cd new-backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r ../requirements.txt
python final-app.py
Backend runs at http://localhost:5000.

Frontend
cd front-end/project
npm install
npm run dev
Frontend runs at http://localhost:5173.

Usage
Start the Flask backend.
Start the Vite dev server.
Open the app, pick a subject, and submit a question + answer (text or file upload).
License
MIT 