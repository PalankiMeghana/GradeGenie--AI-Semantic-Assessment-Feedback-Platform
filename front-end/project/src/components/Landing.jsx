import React from 'react';
import { ArrowRight, Brain } from 'lucide-react';
import { Link } from 'react-scroll';
import About from './About';
import Subjects from './Subjects';
import Upload from './Upload';

const Landing = (props) => {
  return (
    <main>
      <section id="home" className="landing-section">
        {/* Stars background */}
        <div className="stars-container">
          {[...Array(100)].map((_, i) => (
            <div
              key={i}
              className="star"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                opacity: Math.random(),
                animationDuration: `${Math.random() * 3 + 2}s`,
                animationDelay: `${Math.random() * 2}s`
              }}
            />
          ))}
        </div>

        {/* Grid lines */}
        <div className="grid-lines"></div>

        {/* Main content */}
        <div className="landing-container">
          <div className="landing-content">
            {/* Left content */}
            <div className="landing-text fade-in">
              <h1 className="landing-heading slide-up">
                AI-Powered<br />
                Grading &<br />
                Feedback
              </h1>

              <div className="quote-container slide-up" style={{ animationDelay: '0.3s' }}>
                <blockquote className="quote">
                  "Education is the passport to the future,<br />
                  for tomorrow belongs to those who<br />
                  prepare for it today."
                </blockquote>
                <p className="quote-author">— Malcolm X</p>

                
              </div>
            </div>

            {/* Right illustration */}
            <div className="landing-illustration fade-in" style={{ animationDelay: '0.5s' }}>
              {/* Brain icon with glow */}
              <div className="brain-container">
                <div className="brain-glow"></div>
                <Brain className="brain-icon" strokeWidth={1.5} />
              </div>

              {/* Student illustration */}
              <div className="student-illustration">
                <div className="computer-frame">
                  <div className="computer-screen"></div>
                  <div className="computer-base"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Scroll targets below */}
      <About />
      <Subjects onSelectSubject={props.onSelectSubject} />
      <Upload selectedSubject={props.selectedSubject} />
    </main>
  );
};

export default Landing;