# AI Resume Parser API

A FastAPI backend that extracts structured information from PDF and DOCX resumes, compares candidates with a supplied job description, and returns ranked results using the Groq API.

Live Link = https://resume-match-ai-zeta.vercel.app/

## Features

- Accepts multiple PDF or DOCX resumes in one request.
- Streams progress while each resume is read, parsed, and scored.
- Extracts job requirements and candidate details with an LLM.
- Returns candidate match scores, skill matches and gaps, and an overall verdict.
- Includes health status and interactive API documentation.

## Requirements

- Python 3.14 or later
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- A Groq API key with access to `openai/gpt-oss-120b`

## How to use

### 1. Install dependencies

From the project root, run:

```bash
uv sync
```

Or install the backend dependencies with pip:

```bash
python -m pip install -r requirements.txt
```

### 2. Configure the Groq API key

Create a `.env` file in the project root:

```dotenv
GROQ_API_KEY=your_groq_api_key
```

### 3. Start the API server

```bash
uv run uvicorn ai_resume_parser.api:app --reload
```

The API will be available at `http://127.0.0.1:8000`. Open `http://127.0.0.1:8000/docs` to try the endpoints interactively.

### 4. Start the React frontend

In a second terminal, run:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://localhost:5173`). The frontend sends requests to `http://127.0.0.1:8000` by default. To use a different backend URL, create `frontend/.env` based on `frontend/.env.example` and set `VITE_API_BASE_URL`.

The backend allows the local Vite origins by default. For a different frontend host, set `FRONTEND_ORIGINS` in the backend environment to a comma-separated list of allowed origins.

### 5. Check the server

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

### 6. Parse and rank resumes

Send the job description as a form field named `job_description` and attach one or more files using the `files` field:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/parse-resumes \
  -F "job_description=Software engineer with Python, APIs, and distributed systems experience" \
  -F "files=@resumes/Resume2.pdf" \
  -F "files=@resumes/candidate.docx"
```

The frontend uses the streaming endpoint to show progress as each resume is read, parsed, and scored. The JSON endpoint remains available for clients that prefer a single response. Both return structured job requirements and a `candidates` array sorted by score, highest first, plus `top_candidates` and `lowest_candidates`. Each candidate includes the original filename, extracted resume data, score, and match details.

Supported uploads are `.pdf` and `.docx`. Scanned PDFs without selectable text need OCR before upload. The API processes uploads in memory and does not save them to disk.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Check that the API is running |
| `POST` | `/api/v1/parse-resumes` | Parse resumes and return ranked candidate matches |
| `POST` | `/api/v1/parse-resumes/stream` | Stream per-stage progress events and return ranked results |

Interactive OpenAPI documentation is available at `/docs` while the server is running.

## Response shape

The parse endpoint returns a JSON object with:

- `job_requirements`: structured role, skills, experience, education, and responsibilities.
- `candidates`: all analyzed resumes sorted by match score.
- `top_candidates` and `lowest_candidates`: up to two candidates in each group.

## Privacy

Extracted resume text and the job description are sent to Groq for analysis. Only submit resumes you are authorized to process, and review the provider's data handling terms before use.
