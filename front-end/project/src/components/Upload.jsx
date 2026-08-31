import React, { useState, useEffect } from 'react';
import '../styles/components/Upload.css';

const API_BASE_URL = 'https://aigrader-553618692443.europe-west1.run.app/api';

const defaultSubjectsFallback = [
  'Computer Fundamentals',
  'Software Engineering',
  'Operating Systems',
  'Database Management Systems',
  'Computer Networks',
];

const Upload = ({ selectedSubject: propSelectedSubject }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [subject, setSubject] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('text');
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/subjects`);
        if (!response.ok) throw new Error('Failed to fetch subjects');

        const data = await response.json();
        setSubjects(
          data.subjects?.length > 0
            ? data.subjects
            : defaultSubjectsFallback
        );
      } catch (err) {
        console.error('Error fetching subjects:', err);
        setSubjects(defaultSubjectsFallback);
      }
    };

    fetchSubjects();
  }, []);

  useEffect(() => {
    if (subjects.length > 0) {
      if (propSelectedSubject && subjects.includes(propSelectedSubject)) {
        setSubject(propSelectedSubject);
      } else if (!subject || !subjects.includes(subject)) {
        setSubject(subjects[0]);
      }
    }
  }, [propSelectedSubject, subjects, subject]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const allowedExtensions = /\.(txt|pdf|jpe?g|png)$/i;
    const maxFileSize = 16 * 1024 * 1024;

    if (!allowedExtensions.test(selectedFile.name)) {
      setError('Unsupported file type. Please upload PDF, TXT, PNG, or JPG.');
      setFile(null);
      e.target.value = null;
      return;
    }

    if (selectedFile.size > maxFileSize) {
      setError(
        `File too large (${(selectedFile.size / 1024 / 1024).toFixed(2)}MB). Max 16MB.`
      );
      setFile(null);
      e.target.value = null;
      return;
    }

    setError('');
    setFile(selectedFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEvaluationResult(null);

    if (!question.trim()) {
      setError('Please enter the question.');
      return;
    }

    if (!subject) {
      setError('Please select a subject.');
      return;
    }

    if (activeTab === 'text' && !answer.trim()) {
      setError('Please enter your answer.');
      return;
    }

    if (activeTab === 'file' && !file && !answer.trim()) {
      setError('Please select a file or type your answer.');
      return;
    }

    setLoading(true);

    try {
      let requestBody;
      const headers = {};
      const endpoint = `${API_BASE_URL}/evaluate`;

      if (activeTab === 'file' && file) {
        const formData = new FormData();

        formData.append('question', question);
        formData.append('student_answer', answer);
        formData.append('subject', subject);
        formData.append('file', file);

        requestBody = formData;
      } else {
        requestBody = JSON.stringify({
          question,
          student_answer: answer,
          subject,
        });

        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: requestBody,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || `Server error: ${response.status}`
        );
      }

      setEvaluationResult(result);
    } catch (err) {
      console.error('Evaluation submission error:', err);

      let errorMessage = 'Failed to get evaluation. Please try again.';

      if (err.message) {
        const message = err.message.toLowerCase();

        if (
          message.includes('failed to fetch') ||
          message.includes('network')
        ) {
          errorMessage =
            'Could not connect to the GradeGenie backend. Make sure Flask is running on port 5000.';
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      setEvaluationResult(null);
    } finally {
      setLoading(false);

      setTimeout(() => {
        const feedbackElement = document.getElementById('feedback-section');

        if (feedbackElement) {
          feedbackElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }, 50);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFile(null);
    setError('');
    setEvaluationResult(null);

    const fileInput = document.getElementById('file-upload');

    if (fileInput) {
      fileInput.value = null;
    }
  };

  const getGradeClass = (grade) => {
    if (grade === undefined || grade === null) return 'default';
    if (grade >= 90) return 'a';
    if (grade >= 80) return 'b';
    if (grade >= 70) return 'c';
    if (grade >= 60) return 'd';
    return 'f';
  };

  const getGradeLetter = (grade) => {
    if (grade === undefined || grade === null) return 'N/A';
    if (grade >= 90) return 'A';
    if (grade >= 80) return 'B';
    if (grade >= 70) return 'C';
    if (grade >= 60) return 'D';
    return 'F';
  };

  const getGradeMessage = (grade) => {
    if (grade === undefined || grade === null) {
      return 'Evaluation completed';
    }
    if (grade >= 90) return 'Excellent understanding';
    if (grade >= 80) return 'Strong understanding';
    if (grade >= 70) return 'Good understanding';
    if (grade >= 60) return 'Developing understanding';
    return 'Needs improvement';
  };

  const getScore = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Math.min(100, numericValue * 100));
  };

  const formatScore = (value) => getScore(value).toFixed(1);

  const getConceptsByStatus = (status) => {
    return (
      evaluationResult?.evaluation_details?.concepts?.filter(
        (concept) => concept.status === status
      ) || []
    );
  };

  const coveredConcepts = getConceptsByStatus('covered');
  const missingConcepts = getConceptsByStatus('missing');
  const contradictedConcepts = getConceptsByStatus('contradicted');

  const grade = Number(evaluationResult?.grade);
  const safeGrade = Number.isFinite(grade)
    ? Math.max(0, Math.min(100, grade))
    : 0;

  const gradeClass = getGradeClass(evaluationResult?.grade);

  return (
    <div className="upload-container" id="upload-component-section">
      <div className="evaluator-intro">
        <span className="intro-kicker">GRADEGENIE</span>
        <h1>AI Assignment Evaluator</h1>
        <p className="upload-description">
          Submit your answer for semantic, rubric-based evaluation
          and concept-level feedback.
        </p>
      </div>

      <div className="tab-container" role="tablist" aria-label="Submission type">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'text'}
          className={`tab ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => handleTabChange('text')}
          disabled={loading}
        >
          Enter Text
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'file'}
          className={`tab ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => handleTabChange('file')}
          disabled={loading}
        >
          Upload File
        </button>
      </div>

      <form onSubmit={handleSubmit} className="upload-form">
        <div className="form-group">
          <label htmlFor="subject">Subject</label>

          <select
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="select-input"
            disabled={loading || subjects.length === 0}
            required
          >
            {subjects.length === 0 && (
              <option value="">Loading subjects...</option>
            )}

            {subjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="question">Question</label>

          <textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter the assignment question here..."
            rows={3}
            className="text-input"
            required
            disabled={loading}
          />
        </div>

        {activeTab === 'text' && (
          <div className="form-group">
            <label htmlFor="answer-text">Your Answer</label>

            <textarea
              id="answer-text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              rows={9}
              className="text-input answer-input"
              required
              disabled={loading}
            />
          </div>
        )}

        {activeTab === 'file' && (
          <div className="form-group file-upload-section">
            <input
              type="file"
              id="file-upload"
              className="file-input"
              onChange={handleFileChange}
              accept=".pdf,.txt,.png,.jpg,.jpeg"
              disabled={loading}
            />

            <label
              htmlFor="file-upload"
              className="file-input-label-button"
            >
              Choose Document
            </label>

            <p className="file-help">
              PDF, TXT, PNG or JPG · Maximum 16 MB
            </p>

            {file && (
              <div className="selected-file">
                <span className="selected-file-icon">✓</span>
                <span className="file-name">{file.name}</span>
              </div>
            )}

            <label
              htmlFor="file-answer-notes"
              className="optional-label"
            >
              Optional answer or notes
            </label>

            <textarea
              id="file-answer-notes"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer as a backup or add notes..."
              rows={5}
              className="text-input"
              disabled={loading}
            />
          </div>
        )}

        {error && <p className="error-message">{error}</p>}

        <button
          type="submit"
          className="submit-button"
          disabled={
            loading ||
            !question.trim() ||
            !subject ||
            (activeTab === 'text' && !answer.trim()) ||
            (activeTab === 'file' && !file && !answer.trim())
          }
        >
          {loading ? (
            <>
              <span className="button-spinner" />
              Evaluating...
            </>
          ) : (
            'Generate Feedback'
          )}
        </button>
      </form>

      {loading && (
        <div className="loading-indicator">
          <div className="loading-orb">
            <div className="spinner" />
          </div>
          <p className="loading-title">Analyzing your answer</p>
          <p className="loading-subtitle">
            Evaluating concepts, semantic quality, and answer consistency...
          </p>
        </div>
      )}

      {evaluationResult && !error && (
        <div className="evaluation-dashboard" id="feedback-section">
          <div className="evaluation-header">
            <div>
              <span className="evaluation-eyebrow">AI ASSESSMENT</span>
              <h2>Evaluation Results</h2>
              <p>
                Your response has been evaluated using semantic similarity
                and concept-level analysis.
              </p>
            </div>

            <div className="evaluation-status">
              <span className="status-dot" />
              Evaluation Complete
            </div>
          </div>

          <div className="evaluation-hero">
            <div
              className={`grade-ring grade-${gradeClass}`}
              style={{ '--score': safeGrade }}
              aria-label={`Overall grade ${evaluationResult.grade ?? 'N/A'} percent`}
            >
              <div className="grade-ring-inner">
                <span className="grade-value">
                  {evaluationResult.grade ?? 'N/A'}%
                </span>
                <span className="grade-letter">
                  Grade {getGradeLetter(evaluationResult.grade)}
                </span>
              </div>
            </div>

            <div className="grade-summary">
              <span className="summary-label">Overall Assessment</span>
              <h3>{getGradeMessage(evaluationResult.grade)}</h3>
              <p>
                {evaluationResult.feedback?.summary ||
                  'Your response has been evaluated against the expected concepts.'}
              </p>

              <div className="grade-progress" aria-hidden="true">
                <div
                  className={`grade-progress-fill grade-${gradeClass}`}
                  style={{ width: `${safeGrade}%` }}
                />
              </div>
            </div>
          </div>

          <div className="evaluation-metrics">
            <div className="metric-card">
              <div className="metric-top">
                <span>Question Match</span>
                <span className="metric-icon">⌕</span>
              </div>

              <strong>
                {formatScore(evaluationResult.question_match_similarity)}%
              </strong>

              <div className="metric-bar">
                <div
                  style={{
                    width: `${getScore(
                      evaluationResult.question_match_similarity
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-top">
                <span>Concept Coverage</span>
                <span className="metric-icon">✓</span>
              </div>

              <strong>
                {formatScore(evaluationResult.concept_coverage)}%
              </strong>

              <div className="metric-bar">
                <div
                  style={{
                    width: `${getScore(evaluationResult.concept_coverage)}%`,
                  }}
                />
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-top">
                <span>Semantic Quality</span>
                <span className="metric-icon">✦</span>
              </div>

              <strong>
                {formatScore(evaluationResult.semantic_quality)}%
              </strong>

              <div className="metric-bar">
                <div
                  style={{
                    width: `${getScore(evaluationResult.semantic_quality)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <section className="evaluation-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">CONCEPT ANALYSIS</span>
                <h3>What your answer covered</h3>
              </div>
            </div>

            {coveredConcepts.length > 0 && (
              <div className="concept-group covered-group">
                <div className="concept-group-title">
                  <span className="concept-status-icon">✓</span>
                  <div>
                    <strong>Concepts Covered</strong>
                    <span>
                      {coveredConcepts.length} concept
                      {coveredConcepts.length !== 1 ? 's' : ''} identified
                    </span>
                  </div>
                </div>

                <div className="concept-list">
                  {coveredConcepts.map((concept, idx) => (
                    <div
                      className="concept-item"
                      key={`covered-${idx}`}
                    >
                      <span className="concept-check">✓</span>
                      <div>
                        <p>{concept.text}</p>

                        {concept.similarity !== undefined && (
                          <span className="concept-score">
                            Match {(Number(concept.similarity) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {missingConcepts.length > 0 && (
              <div className="concept-group missing-group">
                <div className="concept-group-title">
                  <span className="concept-status-icon">!</span>
                  <div>
                    <strong>Concepts Missing</strong>
                    <span>
                      Topics that could strengthen your answer
                    </span>
                  </div>
                </div>

                <div className="concept-list">
                  {missingConcepts.map((concept, idx) => (
                    <div
                      className="concept-item"
                      key={`missing-${idx}`}
                    >
                      <span className="concept-warning">!</span>
                      <div>
                        <p>{concept.text}</p>

                        {concept.similarity !== undefined && (
                          <span className="concept-score">
                            Match {(Number(concept.similarity) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {contradictedConcepts.length > 0 && (
              <div className="concept-group contradicted-group">
                <div className="concept-group-title">
                  <span className="concept-status-icon">×</span>
                  <div>
                    <strong>Potentially Incorrect Statements</strong>
                    <span>
                      Statements that conflict with expected concepts
                    </span>
                  </div>
                </div>

                <div className="concept-list">
                  {contradictedConcepts.map((concept, idx) => (
                    <div
                      className="concept-item"
                      key={`contradicted-${idx}`}
                    >
                      <span className="concept-error">×</span>
                      <div>
                        <p>{concept.text}</p>

                        {concept.student_match && (
                          <div className="student-match">
                            <span>Your statement</span>
                            <p>"{concept.student_match}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coveredConcepts.length === 0 &&
              missingConcepts.length === 0 &&
              contradictedConcepts.length === 0 && (
                <div className="empty-analysis">
                  No concept-level details were returned for this evaluation.
                </div>
              )}
          </section>

          {(evaluationResult.feedback?.strengths?.length > 0 ||
            evaluationResult.feedback?.improvements?.length > 0) && (
            <div className="feedback-grid">
              {evaluationResult.feedback?.strengths?.length > 0 && (
                <div className="feedback-card strengths-card">
                  <div className="feedback-card-header">
                    <span className="feedback-icon">✓</span>
                    <div>
                      <span className="section-kicker">POSITIVE</span>
                      <h3>Strengths</h3>
                    </div>
                  </div>

                  <ul>
                    {evaluationResult.feedback.strengths.map((item, idx) => (
                      <li key={`strength-${idx}`}>
                        <span>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluationResult.feedback?.improvements?.length > 0 && (
                <div className="feedback-card improvement-card">
                  <div className="feedback-card-header">
                    <span className="feedback-icon">→</span>
                    <div>
                      <span className="section-kicker">NEXT STEP</span>
                      <h3>Areas to Improve</h3>
                    </div>
                  </div>

                  <ul>
                    {evaluationResult.feedback.improvements.map(
                      (item, idx) => (
                        <li key={`improvement-${idx}`}>
                          <span>→</span>
                          {item}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="evaluation-details">
            <div className="details-header">
              <div>
                <span className="section-kicker">SCORING</span>
                <h3>Evaluation Details</h3>
              </div>

              <span className="details-badge">Semantic Evaluation</span>
            </div>

            <div className="detail-row">
              <span>Question match</span>
              <strong>
                {formatScore(evaluationResult.question_match_similarity)}%
              </strong>
            </div>

            <div className="detail-row">
              <span>Concept coverage</span>
              <strong>
                {formatScore(evaluationResult.concept_coverage)}%
              </strong>
            </div>

            <div className="detail-row">
              <span>Semantic quality</span>
              <strong>
                {formatScore(evaluationResult.semantic_quality)}%
              </strong>
            </div>
          </div>
        </div>
      )}

      {error && !loading && !evaluationResult && (
        <div
          className="feedback-container error-container"
          id="feedback-section"
        >
          <h2>Evaluation Failed</h2>
          <p className="error-message">{error}</p>
        </div>
      )}
    </div>
  );
};

export default Upload;
