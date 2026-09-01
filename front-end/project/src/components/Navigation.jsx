import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Link as ScrollLink } from 'react-scroll';
import { Lightbulb, Menu, X } from 'lucide-react';
import '../styles/components/Navigation.css';

const Navigation = ({ darkMode, toggleDarkMode }) => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMenu = () => setMenuOpen(prev => !prev);
  const closeMenu = () => setMenuOpen(false);

  // Only use react-scroll on the landing page
  const isLanding = location.pathname === '/';

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="navbar-container">
        <RouterLink to="/" className="navbar-logo" onClick={closeMenu}>
          <Lightbulb className="logo-icon" size={24} />
          <span className="logo-text">GradeGenie</span>
        </RouterLink>

        <button className="navbar-toggle" onClick={toggleMenu}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <ul className={`navbar-links ${menuOpen ? 'open' : ''}`}>
          {['home', 'about', 'subjects', 'upload'].map((section) => (
            <li key={section}>
              {isLanding ? (
                <ScrollLink
                  to={section}
                  spy={true}
                  smooth={true}
                  offset={-70}
                  duration={500}
                  onClick={closeMenu}
                  className="nav-link"
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </ScrollLink>
              ) : (
                <RouterLink
                  to={section === 'home' ? '/' : `/${section}`}
                  onClick={closeMenu}
                  className="nav-link"
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </RouterLink>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default Navigation;
