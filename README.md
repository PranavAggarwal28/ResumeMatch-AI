# AI Resume Parser

AI Resume Parser extracts candidate details from PDF and DOCX resumes, compares them with a job description, and reports match scores using the Groq API.

## Features

- Reads text from PDF and DOCX resumes.
- Uses an LLM to structure job requirements and candidate experience.
- Scores each candidate against the job description and summarizes matching skills, gaps, and experience.
- Prints the two highest-scoring and two lowest-scoring candidates.

## Requirements

- Python 3.14 or later
- [uv](https://docs.astral.sh/uv/getting-started/installation/) for dependency management
- A Groq API key with access to the `openai/gpt-oss-120b` model

## How to use

1. **Get the project and install its dependencies.** From the project directory, run:

   ```bash
   uv sync
   ```

2. **Set your Groq API key.** Create a `.env` file in the project root with:

   ```dotenv
   GROQ_API_KEY=your_groq_api_key
   ```

   The repository includes an `example_env` file you can use as a reference. Keep your real key private; `.env` is ignored by Git.

3. **Set the job description.** Open `ai_res_parse.py` and replace the text assigned to `job_description` with the role you want to hire for.

4. **Add resumes.** Put PDF or DOCX files in the `resumes/` folder. The script processes every supported file in that folder. It expects the folder to exist, and currently reads text-based PDFs (scanned PDFs without a text layer may not produce usable content).

5. **Run the parser** from the project root:

   ```bash
   uv run python ai_res_parse.py
   ```

   Results, including each candidate's score and match details, are printed in the terminal. The script does not currently save results to a file.

## How it works

The script first extracts structured requirements from the configured job description. It then extracts resume details for each supported file, compares each candidate with those requirements, sorts candidates by match score, and prints the top and bottom results. It pauses between Groq requests to reduce request bursts.

## Privacy

Resume text and the job description are sent to Groq for parsing and scoring. Only process resumes you are authorized to share with the configured service, and review its data handling terms before use.

## Project layout

```text
.
├── ai_res_parse.py   # Parsing, comparison, and batch-run workflow
├── example_env       # Example environment variable names
├── pyproject.toml    # Project metadata and dependencies
└── resumes/          # Place PDF and DOCX resumes here
```
