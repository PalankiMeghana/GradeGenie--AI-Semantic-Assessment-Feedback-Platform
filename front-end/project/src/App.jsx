// --- START OF MODIFIED App.jsx ---
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import Navigation from './components/Navigation';
import Landing from './components/Landing';
import About from './components/About';
import Subjects from './components/Subjects';
import Upload from './components/Upload';
import ScrollToTop from './components/ScrollToTop';

import './styles/main.css'; // Ensure .gradient-wrapper is defined here or imported

// Main application page component that groups sections
const MainPageLayout = ({ selectedSubject, handleSubjectSelect }) => {
  return (
    // Apply the gradient wrapper here to encompass all sections on this layout
    <div className="gradient-wrapper">
      <About />
      <Subjects onSelectSubject={handleSubjectSelect} />
      <Upload selectedSubject={selectedSubject} />
    </div>
  );
};

function App() {
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let initialDarkMode;
    if (storedDarkMode !== null) {
      initialDarkMode = storedDarkMode === 'true';
    } else {
      initialDarkMode = systemPrefersDark;
    }
    
    setDarkMode(initialDarkMode);
    document.documentElement.classList.toggle('dark', initialDarkMode);
    if (storedDarkMode === null) {
        localStorage.setItem('darkMode', initialDarkMode.toString());
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(prevDarkMode => {
      const newDarkMode = !prevDarkMode;
      localStorage.setItem('darkMode', newDarkMode.toString());
      document.documentElement.classList.toggle('dark', newDarkMode);
      return newDarkMode;
    });
  };

  const handleSubjectSelect = (subject) => {
    setSelectedSubject(subject);
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeInOut" } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3, ease: "easeInOut" } }
  };
  
  const location = useLocation();

  return (
    <div className={`app-container ${darkMode ? 'dark-theme-explicit' : 'light-theme-explicit'}`}>
      <Navigation darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      <ScrollToTop />
      
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
        >
          <Routes location={location}>
            <Route path="/" element={<Landing />} />
            <Route 
              path="/evaluate"
              element={
                <MainPageLayout 
                  selectedSubject={selectedSubject} 
                  handleSubjectSelect={handleSubjectSelect} 
                />
              } 
            />
            {/* Add other routes here if needed */}
          </Routes>
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

const AppWrapper = () => (
  <Router>
    <App />
  </Router>
);

export default AppWrapper;
// --- END OF MODIFIED App.jsx ---