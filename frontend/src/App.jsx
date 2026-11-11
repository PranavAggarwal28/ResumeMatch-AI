import { useRef, useState } from 'react';

const API_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const ACCEPTED_TYPES = '.pdf,.docx';

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="brand-mark">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3" />
      <circle cx="11" cy="11" r="4" />
      <path d="m14 14 4 4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="upload-icon">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M12 18v-7m-3 3 3-3 3 3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="file-icon">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function prettyLabel(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DetailValue({ value }) {
  if (Array.isArray(value)) {
    if (!value.length) return <span className="detail-empty">None listed</span>;
    return (
      <div className="tag-list">
        {value.map((item, index) => <span className="tag" key={`${item}-${index}`}>{String(item)}</span>)}
      </div>
    );
  }

  if (value === null || value === undefined || value === '') return <span className="detail-empty">Not specified</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'object') return <span>{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

function CandidateCard({ candidate, rank }) {
  const details = candidate.details || {};
  const knownKeys = new Set([
    'candidate_name', 'name', 'matching_skills', 'matched_skills', 'missing_important_skills',
    'missing_skills', 'experience_requirement_met', 'experience_met', 'final_verdict', 'verdict',
  ]);
  const entries = Object.entries(details);
  const matchingSkills = entries.find(([key]) => ['matching_skills', 'matched_skills'].includes(key.toLowerCase()))?.[1];
  const missingSkills = entries.find(([key]) => ['missing_important_skills', 'missing_skills'].includes(key.toLowerCase()))?.[1];
  const experienceMet = entries.find(([key]) => ['experience_requirement_met', 'experience_met'].includes(key.toLowerCase()))?.[1];
  const verdict = entries.find(([key]) => ['final_verdict', 'verdict'].includes(key.toLowerCase()))?.[1];
  const otherEntries = entries.filter(([key]) => !knownKeys.has(key.toLowerCase()));
  const scoreClass = candidate.score >= 75 ? 'score-high' : candidate.score >= 50 ? 'score-mid' : 'score-low';

  return (
    <article className="candidate-card">
      <div className="candidate-heading">
        <div className="candidate-identity">
          <div className="candidate-avatar" aria-hidden="true">{(candidate.name || candidate.filename || '?').trim().charAt(0).toUpperCase()}</div>
          <div className="candidate-title">
            <span className="candidate-rank">CANDIDATE {String(rank).padStart(2, '0')}</span>
            <h3>{candidate.name || 'Name not found'}</h3>
            <span className="candidate-filename"><FileIcon />{candidate.filename}</span>
          </div>
        </div>
        <div className={`score-pill ${scoreClass}`} aria-label={`Match score ${Math.round(candidate.score)} percent`}>
          <strong>{Math.round(candidate.score)}%</strong>
          <span>match</span>
        </div>
      </div>

      {verdict && <p className="verdict">{String(verdict)}</p>}

      <div className="candidate-details">
        {matchingSkills !== undefined && (
          <section className="detail-section">
            <h4><span className="detail-dot positive" />Matching skills</h4>
            <DetailValue value={matchingSkills} />
          </section>
        )}
        {missingSkills !== undefined && (
          <section className="detail-section">
            <h4><span className="detail-dot caution" />Skills to build</h4>
            <DetailValue value={missingSkills} />
          </section>
        )}
        {experienceMet !== undefined && (
          <section className="detail-section compact-detail">
            <h4>Experience requirement</h4>
            <DetailValue value={experienceMet} />
          </section>
        )}
        {otherEntries.map(([key, value]) => (
          <section className="detail-section" key={key}>
            <h4>{prettyLabel(key)}</h4>
            <DetailValue value={value} />
          </section>
        ))}
      </div>

      {candidate.resume?.skills?.length > 0 && (
        <div className="resume-skills">
          <h4>Resume skills</h4>
          <DetailValue value={candidate.resume.skills} />
        </div>
      )}
    </article>
  );
}

function App() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [jobDescription, setJobDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  function addFiles(incoming) {
    const allowed = Array.from(incoming).filter((file) => /\.(pdf|docx)$/i.test(file.name));
    if (allowed.length !== incoming.length) {
      setError('Please choose PDF or DOCX files only.');
    } else {
      setError('');
    }
    setFiles((current) => {
      const merged = [...current];
      for (const file of allowed) {
        if (!merged.some((existing) => existing.name === file.name && existing.size === file.size)) merged.push(file);
      }
      return merged;
    });
    setResults(null);
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setResults(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setResults(null);

    if (!files.length) {
      setError('Add at least one resume to continue.');
      return;
    }
    if (jobDescription.trim().length < 20) {
      setError('Please enter a job description with at least 20 characters.');
      return;
    }

    const formData = new FormData();
    formData.append('job_description', jobDescription.trim());
    files.forEach((file) => formData.append('files', file));

    setIsLoading(true);
    setProgress({ percent: 0, completed_steps: 0, total_steps: 1 + 3 * files.length, message: 'Starting analysis' });
    try {
      const response = await fetch(`${API_URL}/api/v1/parse-resumes/stream`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload.detail === 'string'
          ? payload.detail
          : 'The analysis request failed. Check that the API is running and try again.';
        throw new Error(message);
      }

      if (!response.body) throw new Error('The server did not provide a progress stream. Restart the backend and try again.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResults = null;

      function handleEvent(frame) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!data) return;
        const message = JSON.parse(data);
        if (message.type === 'progress') setProgress(message);
        if (message.type === 'error') throw new Error(message.message || 'Resume analysis failed.');
        if (message.type === 'result') finalResults = message.data;
      }

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        frames.forEach(handleEvent);
        if (done) break;
      }
      if (buffer.trim()) handleEvent(buffer);
      if (!finalResults) throw new Error('The analysis stream ended before results were returned. Check the backend terminal and try again.');

      setProgress((current) => ({ ...current, percent: 100, message: 'Analysis complete' }));
      setResults(finalResults);
      window.setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (requestError) {
      setError(requestError instanceof TypeError
        ? `Could not connect to the API at ${API_URL}. Start the backend and try again.`
        : requestError.message || 'Something went wrong while analyzing the resumes.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ResumeAI home">
          <BrandMark />
          <span>ResumeAI</span>
        </a>
        <span className="ai-badge"><span className="status-dot" />AI Powered</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span className="eyebrow-line" />CAREER MATCHING, REIMAGINED</div>
        <h1>Find your career match<span>.</span></h1>
        <p>Analyze your resume against any job description.</p>
      </section>

      <form className="analyzer-panel" onSubmit={handleSubmit}>
        <div className="section-heading">
          <div>
            <span className="step-label">STEP 01</span>
            <h2>Upload your resume</h2>
          </div>
          <span className="file-count">{files.length ? `${files.length} selected` : 'PDF or DOCX'}</span>
        </div>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          onChange={(event) => {
            addFiles(event.target.files || []);
            event.target.value = '';
          }}
        />
        <button
          className={`dropzone ${isDragging ? 'dropzone-active' : ''}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <span className="upload-icon-wrap"><UploadIcon /></span>
          <strong>Drop your resumes here</strong>
          <span>or <span className="browse-link">browse files</span> from your device</span>
          <small>PDF and DOCX · Multiple files supported</small>
        </button>

        {files.length > 0 && (
          <ul className="file-list" aria-label="Selected resumes">
            {files.map((file, index) => (
              <li className="file-item" key={`${file.name}-${file.size}`}>
                <span className="file-item-icon"><FileIcon /></span>
                <span className="file-item-name" title={file.name}>{file.name}</span>
                <span className="file-size">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}</span>
                <button className="remove-file" type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}>×</button>
              </li>
            ))}
          </ul>
        )}

        <div className="job-section">
          <div className="section-heading job-heading">
            <div>
              <span className="step-label">STEP 02</span>
              <h2>Job description</h2>
            </div>
            <span className="character-count">{jobDescription.length} characters</span>
          </div>
          <label className="visually-hidden" htmlFor="job-description">Paste the job description</label>
          <textarea
            id="job-description"
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            placeholder="Paste the job description here... Include the role, responsibilities, and skills you’re looking for."
            rows={6}
            required
            minLength={20}
          />
        </div>

        {error && <div className="error-message" role="alert"><span aria-hidden="true">!</span>{error}</div>}

        <button className="analyze-button" type="submit" disabled={isLoading}>
          {isLoading ? <><span className="spinner" />Analyzing resumes…</> : <>Analyze resumes <span aria-hidden="true">→</span></>}
        </button>
        <p className="privacy-note"><span aria-hidden="true">⌑</span> Resume text is sent to your configured AI provider for analysis.</p>
      </form>

      {isLoading && (
        <div className="loading-note" role="status" aria-live="polite">
          <div className="progress-heading">
            <strong>{progress?.message || 'Finding your strongest matches'}</strong>
            <span>{progress?.percent ?? 0}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Resume analysis progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress?.percent ?? 0}
          >
            <span className="progress-indicator" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <span className="progress-caption">
            {progress ? `${progress.completed_steps} of ${progress.total_steps} analysis steps complete` : 'Preparing your resumes'}
            {' · '}Each resume is parsed and scored individually.
          </span>
        </div>
      )}

      {results && (
        <section className="results-section" id="results" aria-live="polite">
          <div className="results-header">
            <div>
              <span className="step-label">YOUR ANALYSIS</span>
              <h2>Candidate matches</h2>
              <p>{results.candidates?.length || 0} resume{results.candidates?.length === 1 ? '' : 's'} ranked against your job description</p>
            </div>
            <span className="results-role">{results.job_requirements?.role || 'Role analyzed'}</span>
          </div>

          {results.job_requirements?.required_skills?.length > 0 && (
            <div className="requirements-strip">
              <span>KEY SKILLS</span>
              <DetailValue value={results.job_requirements.required_skills} />
            </div>
          )}

          {results.candidates?.length ? (
            <div className="candidate-list">
              {results.candidates.map((candidate, index) => (
                <CandidateCard key={`${candidate.filename}-${index}`} candidate={candidate} rank={index + 1} />
              ))}
            </div>
          ) : (
            <div className="empty-results">No resumes were returned. Try selecting your files again.</div>
          )}
        </section>
      )}

      <footer className="footer"><span>ResumeAI</span><span>Thoughtful matches. Better next steps.</span></footer>
    </main>
  );
}

export default App;
