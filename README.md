# AI Resume Parser API

A FastAPI backend that extracts structured information from PDF and DOCX resumes, compares candidates with a supplied job description, and returns ranked results using the Groq API.

## Features

- Accepts multiple PDF or DOCX resumes in one request.
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

### 4. Check the server

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

### 5. Parse and rank resumes

Send the job description as a form field named `job_description` and attach one or more files using the `files` field:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/parse-resumes \
  -F "job_description=Software engineer with Python, APIs, and distributed systems experience" \
  -F "files=@resumes/Resume2.pdf" \
  -F "files=@resumes/candidate.docx"
```

The endpoint returns structured job requirements and a `candidates` array sorted by score, highest first. It also includes `top_candidates` and `lowest_candidates` arrays. Each candidate entry contains the original filename, extracted resume data, score, and match details.

Supported uploads are `.pdf` and `.docx`. Scanned PDFs without selectable text need OCR before upload. The API processes uploads in memory and does not save them to disk.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Check that the API is running |
| `POST` | `/api/v1/parse-resumes` | Parse resumes and return ranked candidate matches |

Interactive OpenAPI documentation is available at `/docs` while the server is running.

## Response shape

The parse endpoint returns a JSON object with:

- `job_requirements`: structured role, skills, experience, education, and responsibilities.
- `candidates`: all analyzed resumes sorted by match score.
- `top_candidates` and `lowest_candidates`: up to two candidates in each group.

## Privacy

Extracted resume text and the job description are sent to Groq for analysis. Only submit resumes you are authorized to process, and review the provider's data handling terms before use.
