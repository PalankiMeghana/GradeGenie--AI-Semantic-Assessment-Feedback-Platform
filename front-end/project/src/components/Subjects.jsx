// --- START OF MODIFIED Subjects.jsx ---
import React, { useState, useEffect } from 'react';
import { scroller } from 'react-scroll';
import { Monitor, Code, HardDrive, Database, Brain, Network } from 'lucide-react'; // Added Network for AI example
import '../styles/components/Subjects.css'; // Ensure this path is correct

// CRITICAL: Ensure these 'value' strings precisely match the keys in your
// Python backend's `evaluator.cs_topics` dictionary.
const subjectMapping = {
  'Basics of Computers': 'Computer Fundamentals',
  'Software Development': 'Software Engineering',
  'Operating System': 'Operating Systems',
  'DBMS': 'Database Management Systems', // Corrected to match backend
  'AI & ML': 'Artificial Intelligence',   // IF YOU USE THIS: Ensure "Artificial Intelligence" is a key in backend cs_topics
                                          // OR map to an existing backend key like 'Computer Networks' if more appropriate:
                                          // 'AI & ML': 'Computer Networks',
};

// This data is for display on the cards. The mapping above links it to backend logic.
const subjectsData = [
  {
    id: 1,
    name: 'Basics of Computers', // Display name
    description: 'Fundamental concepts of computer science and IT, hardware, software, and computer generations.',
    icon: <Monitor size={40} />,
  },
  {
    id: 2,
    name: 'Software Development', // Display name
    description: 'Programming, algorithms, SDLC, and software engineering best practices.',
    icon: <Code size={40} />,
  },
  {
    id: 3,
    name: 'Operating System', // Display name
    description: 'Core functions, process management, memory management, and file systems.',
    icon: <HardDrive size={40} />,
  },
  {
    id: 4,
    name: 'DBMS', // Display name
    description: 'Database models, SQL, NoSQL, normalization, and transaction management.',
    icon: <Database size={40} />,
  },
  {
    id: 5,
    name: 'AI & ML', // Display name
    description: 'Concepts of AI, machine learning algorithms, neural networks, and applications.',
    icon: <Brain size={40} />, // Or <Network size={40} /> if mapping to Computer Networks
  },
];

const Subjects = ({ onSelectSubject }) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate a brief loading period for UX, even with static data.
    const timer = setTimeout(() => setLoading(false), 300); // Reduced delay
    return () => clearTimeout(timer);
  }, []);

  const handleCardClick = (subject) => {
    setSelectedSubjectId(subject.id);
    if (onSelectSubject) {
      const backendSubjectName = subjectMapping[subject.name] || subject.name;
      if (!subjectMapping[subject.name]) {
          console.warn(`No specific backend mapping for frontend subject: "${subject.name}". Using display name. Ensure this is intended.`);
      }
      onSelectSubject(backendSubjectName);
    }

    scroller.scrollTo('upload-component-section', {
      duration: 800,
      delay: 0,
      smooth: 'easeInOutQuart',
      offset: -70, // Adjust if you have a sticky header (e.g., a navbar)
    });
  };

  return (
    // Assuming gradient-wrapper is a global style for page section backgrounds
 
      <section id="subjects" className="subjects-section-container">
        <div className="container">
          <h2>Select Your Subject</h2>
          <p className="subjects-description">
            Choose the subject that matches your assignment to receive the most accurate
            feedback and grading. Our AI is trained on subject-specific criteria.
          </p>

          {loading ? (
            <div className="loading-spinner">
              <div className="spinner-icon"></div> {/* Simple spinner or text */}
              Loading Subjects...
            </div>
          ) : (
            <div className="subject-cards">
              {subjectsData.map((subject) => (
                <div
                  key={subject.id}
                  className={`subject-card ${selectedSubjectId === subject.id ? 'selected' : ''}`}
                  onClick={() => handleCardClick(subject)}
                  tabIndex={0}
                  role="button"
                  onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick(subject)}
                  aria-label={`Select ${subject.name}`}
                  aria-pressed={selectedSubjectId === subject.id}
                >
                  <div className="subject-icon-wrapper">
                    {subject.icon}
                  </div>
                  <div className="subject-card-content">
                    <h3>{subject.name}</h3>
                    <p>{subject.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    
  );
};

export default Subjects;
// --- END OF MODIFIED Subjects.jsx ---