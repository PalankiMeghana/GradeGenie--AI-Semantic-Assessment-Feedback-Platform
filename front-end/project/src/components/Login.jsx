import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/api';

const Login = () => {
  const navigate = useNavigate();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Redirect if already logged in
  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate('/subjects');
    }
  }, [navigate]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate input
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      // Call login service
      await authService.login(username, password);
      
      // Redirect to subjects page
      navigate('/subjects');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="auth-container">
      <div className="auth-form-container">
        <h2>Login</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <div className="auth-links">
          <p>
            Don't have an account? <Link to="/register">Register here</Link>
          </p>
        </div>
        
        {/* Demo credentials for testing */}
        <div className="demo-credentials">
          <h4>Demo Credentials</h4>
          <p><strong>Teacher:</strong> username: teacher, password: password123</p>
          <p><strong>Student:</strong> username: student, password: password123</p>
        </div>
      </div>
    </div>
  );
};

export default Login;