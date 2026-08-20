import React from 'react';
import { Brain, Clock, MessageSquare, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import '../styles/components/About.css';

const About = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  return (
  
      
    <section id="about" className="about">
      <motion.div 
        className="container"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <div className="about-container glass-card">
          <div className="about-content">
            <motion.h2 variants={itemVariants}>About Our AI Grading Tool</motion.h2>
            <motion.p variants={itemVariants} className="about-description">
              Our AI-Powered Grading and Feedback Tool uses Natural Language Processing (NLP) 
              and Machine Learning to assess student assignments. It offers automated grading 
              and personalized feedback to improve learning outcomes and reduce grading effort for teachers.
            </motion.p>
            
            <div className="about-features">
              <motion.div variants={itemVariants} className="feature-item glass-card">
                <div className="feature-icon">
                  <Brain size={20} />
                </div>
                <div className="feature-text">
                  <h4>Smart Analysis</h4>
                  <p>Advanced AI algorithms that understand context and evaluate responses intelligently</p>
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="feature-item glass-card">
                <div className="feature-icon">
                  <Clock size={20} />
                </div>
                <div className="feature-text">
                  <h4>Save Time</h4>
                  <p>Reduce grading time by up to 70% while maintaining assessment quality</p>
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="feature-item glass-card">
                <div className="feature-icon">
                  <MessageSquare size={20} />
                </div>
                <div className="feature-text">
                  <h4>Detailed Feedback</h4>
                  <p>Receive specific suggestions and improvement areas, not just scores</p>
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="feature-item glass-card">
                <div className="feature-icon">
                  <Award size={20} />
                </div>
                <div className="feature-text">
                  <h4>Academic Quality</h4>
                  <p>Designed to match educational standards across different disciplines</p>
                </div>
              </motion.div>
            </div>
          </div>
          
          <motion.div variants={itemVariants} className="about-image">
            <img 
              src="https://images.pexels.com/photos/5427671/pexels-photo-5427671.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2" 
              alt="Students learning with technology"
              className="glass-card"
            />
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
};

export default About;
