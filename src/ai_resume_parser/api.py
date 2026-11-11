"""FastAPI backend for parsing resumes and comparing them with a job description."""

import json
import logging
import os
from functools import lru_cache
from io import BytesIO

from dotenv import load_dotenv
from docx import Document
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from groq import Groq
from pydantic import BaseModel, Field
from pypdf import PdfReader


load_dotenv()
logger = logging.getLogger(__name__)

MODEL = "openai/gpt-oss-120b"
SUPPORTED_EXTENSIONS = {".pdf", ".docx"}


class JobRequirements(BaseModel):
    role: str
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    minimum_experience: float | None = None
    education_requirements: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)


class Experience(BaseModel):
    company: str | None = None
    role: str | None = None
    duration: str | None = None
    description: str | None = None
    skills_used: list[str] = Field(default_factory=list)


class Resume(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    total_experience_years: float | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)


class MatchResult(BaseModel):
    score: float = Field(ge=0, le=100)
    details: dict


class CandidateResult(BaseModel):
    filename: str
    name: str | None
    score: float
    details: dict
    resume: Resume


class ParseResumesResponse(BaseModel):
    job_requirements: JobRequirements
    candidates: list[CandidateResult]
    top_candidates: list[CandidateResult]
    lowest_candidates: list[CandidateResult]


@lru_cache(maxsize=1)
def get_groq_client() -> Groq:
    """Create the Groq client on demand so the API can start without a key."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured on the server.",
        )
    return Groq(api_key=api_key)


def ask_groq(messages: list[dict[str, str]]) -> dict:
    """Request a JSON object from Groq and decode the response."""
    response = get_groq_client().chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("The model returned an empty response.")
    return json.loads(content)


def extract_job_requirements(job_description: str) -> JobRequirements:
    schema = JobRequirements.model_json_schema()
    data = ask_groq(
        [
            {
                "role": "system",
                "content": f"""You are an expert HR assistant. Extract structured information from a job description.
Return only a valid JSON object matching this schema: {schema}
Do not return the schema itself or invent information. Use null when minimum experience is not stated and empty lists when list information is missing.""",
            },
            {"role": "user", "content": f"Analyze this job description:\n\n{job_description}"},
        ]
    )
    return JobRequirements.model_validate(data)


def parse_resume(resume_text: str) -> Resume:
    schema = Resume.model_json_schema()
    data = ask_groq(
        [
            {
                "role": "system",
                "content": f"""You are an expert resume parser. Extract information by meaning, not just section headings. Include internships in experience and skills mentioned throughout the resume.
Return only a valid JSON object matching this schema: {schema}
Do not invent information. Use null for unknown values and empty lists when list information is missing.""",
            },
            {"role": "user", "content": f"Parse this resume:\n\n{resume_text}"},
        ]
    )
    return Resume.model_validate(data)


def score_resume(job: JobRequirements, resume: Resume) -> MatchResult:
    schema = MatchResult.model_json_schema()
    prompt = f"""Compare the candidate with the job requirements.

JOB REQUIREMENTS:
{job.model_dump_json(indent=2)}

CANDIDATE RESUME:
{resume.model_dump_json(indent=2)}

Return only a JSON object matching this schema: {schema}
In details, include the candidate name, matching skills, important missing skills, whether the experience requirement is met, and a concise verdict. Give an overall match percentage from 0 to 100. Do not invent information."""
    data = ask_groq([{"role": "user", "content": prompt}])
    return MatchResult.model_validate(data)


def extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def extract_docx_text(content: bytes) -> str:
    document = Document(BytesIO(content))
    parts = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                if cell.text.strip():
                    parts.append(cell.text.strip())
    return "\n".join(parts)


def extract_resume_text(filename: str, content: bytes) -> str:
    suffix = os.path.splitext(filename)[1].lower()
    if suffix == ".pdf":
        text = extract_pdf_text(content)
    elif suffix == ".docx":
        text = extract_docx_text(content)
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type for '{filename}'. Upload PDF or DOCX files.",
        )

    if not text:
        raise HTTPException(
            status_code=422,
            detail=f"No text could be extracted from '{filename}'. Scanned PDFs need OCR first.",
        )
    return text


app = FastAPI(
    title="AI Resume Parser API",
    description="Extract resume details and compare candidates with a job description.",
    version="1.0.0",
)

frontend_origins = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in frontend_origins.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/parse-resumes", response_model=ParseResumesResponse, tags=["resumes"])
def parse_resumes(
    job_description: str = Form(..., min_length=20),
    files: list[UploadFile] = File(..., min_length=1),
) -> ParseResumesResponse:
    """Parse uploaded resumes and return candidates ranked by match score."""
    job_description = job_description.strip()
    if len(job_description) < 20:
        raise HTTPException(
            status_code=422,
            detail="job_description must contain at least 20 non-whitespace characters.",
        )

    try:
        job = extract_job_requirements(job_description)
    except HTTPException:
        raise


    except Exception as exc:
        logger.exception("AI provider failed during job description analysis")
        raise HTTPException(
            status_code=502,
            detail="AI analysis failed while reading the job description. Check the backend terminal for the provider error.",
        ) from exc

    try:
        candidates = []

        for upload in files:
            filename = upload.filename or "unnamed-file"
            suffix = os.path.splitext(filename)[1].lower()
            if suffix not in SUPPORTED_EXTENSIONS:
                raise HTTPException(
                    status_code=415,
                    detail=f"Unsupported file type for '{filename}'. Upload PDF or DOCX files.",
                )

            content = upload.file.read()
            if not content:
                raise HTTPException(status_code=422, detail=f"'{filename}' is empty.")

            try:
                resume_text = extract_resume_text(filename, content)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"Could not read '{filename}'. Make sure it is a valid, unencrypted PDF or DOCX file.",
                ) from exc

            try:
                resume = parse_resume(resume_text)
                match = score_resume(job, resume)
            except HTTPException:
                raise
            except Exception as exc:
                logger.exception("AI provider failed during resume parsing or candidate scoring")
                raise HTTPException(
                    status_code=502,
                    detail="AI analysis failed while parsing a resume or scoring a candidate. Check the backend terminal for the provider error.",
                ) from exc

            candidates.append(
                CandidateResult(
                    filename=filename,
                    name=resume.name,
                    score=match.score,
                    details=match.details,
                    resume=resume,
                )
            )

        candidates.sort(key=lambda candidate: candidate.score, reverse=True)
        return ParseResumesResponse(
            job_requirements=job,
            candidates=candidates,
            top_candidates=candidates[:2],
            lowest_candidates=list(reversed(candidates[-2:])),
        )
    except HTTPException:
        raise


@app.post("/api/v1/parse-resumes/stream", tags=["resumes"])
def parse_resumes_stream(
    job_description: str = Form(..., min_length=20),
    files: list[UploadFile] = File(..., min_length=1),
) -> StreamingResponse:
    """Stream per-stage and per-resume progress as server-sent events."""
    job_description = job_description.strip()
    if len(job_description) < 20:
        raise HTTPException(
            status_code=422,
            detail="job_description must contain at least 20 non-whitespace characters.",
        )

    prepared_files: list[tuple[str, bytes]] = []
    for upload in files:
        filename = upload.filename or "unnamed-file"
        suffix = os.path.splitext(filename)[1].lower()
        if suffix not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type for '{filename}'. Upload PDF or DOCX files.",
            )
        content = upload.file.read()
        if not content:
            raise HTTPException(status_code=422, detail=f"'{filename}' is empty.")
        prepared_files.append((filename, content))

    def event(payload: dict) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def stream_events():
        total_steps = 1 + 3 * len(prepared_files)
        completed_steps = 0

        def progress(stage: str, message: str, filename: str | None = None) -> dict:
            return {
                "type": "progress",
                "stage": stage,
                "message": message,
                "filename": filename,
                "completed_steps": completed_steps,
                "total_steps": total_steps,
                "percent": round(completed_steps / total_steps * 100),
            }

        yield event(progress("job_description", "Analyzing the job description"))
        try:
            job = extract_job_requirements(job_description)
        except HTTPException as exc:
            yield event({"type": "error", "message": exc.detail, "status": exc.status_code})
            return
        except Exception as exc:
            logger.exception("AI provider failed during streamed job description analysis")
            yield event({
                "type": "error",
                "message": "AI analysis failed while reading the job description. Check the backend terminal for the provider error.",
                "status": 502,
            })
            return

        completed_steps += 1
        yield event(progress("job_description_complete", "Job description analyzed"))
        candidates: list[CandidateResult] = []

        for filename, content in prepared_files:
            yield event(progress("reading_resume", f"Reading {filename}", filename))
            try:
                resume_text = extract_resume_text(filename, content)
            except HTTPException as exc:
                yield event({"type": "error", "message": exc.detail, "status": exc.status_code})
                return
            except Exception as exc:
                logger.exception("Failed to extract text from uploaded resume")
                yield event({
                    "type": "error",
                    "message": f"Could not read '{filename}'. Make sure it is a valid, unencrypted PDF or DOCX file.",
                    "status": 422,
                })
                return

            completed_steps += 1
            yield event(progress("resume_read", f"Resume text extracted: {filename}", filename))
            yield event(progress("parsing_resume", f"Parsing resume: {filename}", filename))
            try:
                resume = parse_resume(resume_text)
            except HTTPException as exc:
                yield event({"type": "error", "message": exc.detail, "status": exc.status_code})
                return
            except Exception as exc:
                logger.exception("AI provider failed during streamed resume parsing")
                yield event({
                    "type": "error",
                    "message": "AI analysis failed while parsing a resume. Check the backend terminal for the provider error.",
                    "status": 502,
                })
                return

            completed_steps += 1
            candidate_name = resume.name or filename
            yield event(progress("resume_parsed", f"Resume parsed: {candidate_name}", filename))
            yield event(progress("scoring_resume", f"Scoring candidate: {candidate_name}", filename))
            try:
                match = score_resume(job, resume)
            except HTTPException as exc:
                yield event({"type": "error", "message": exc.detail, "status": exc.status_code})
                return
            except Exception as exc:
                logger.exception("AI provider failed during streamed candidate scoring")
                yield event({
                    "type": "error",
                    "message": "AI analysis failed while scoring a candidate. Check the backend terminal for the provider error.",
                    "status": 502,
                })
                return

            candidates.append(
                CandidateResult(
                    filename=filename,
                    name=resume.name,
                    score=match.score,
                    details=match.details,
                    resume=resume,
                )
            )
            completed_steps += 1
            yield event(progress("candidate_complete", f"Finished: {candidate_name}", filename))

        candidates.sort(key=lambda candidate: candidate.score, reverse=True)
        response = ParseResumesResponse(
            job_requirements=job,
            candidates=candidates,
            top_candidates=candidates[:2],
            lowest_candidates=list(reversed(candidates[-2:])),
        )
        yield event({"type": "result", "data": response.model_dump(mode="json")})

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
