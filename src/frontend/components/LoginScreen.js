import React, { useState } from 'react';

const LoginScreen = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    pin: '',
    otp: ''
  });
  const [step, setStep] = useState(1); // Multi-step authentication
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    if (!credentials.username || !credentials.password) {
      setError('Please enter username and password');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Simulate API call for basic auth
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStep(2); // Move to PIN/OTP step
    } catch (err) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    if (!credentials.pin) {
      setError('Please enter your PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Authenticate with backend
      let result;
      if (window.electronAPI) {
        result = await window.electronAPI.authenticateUser(credentials);
      } else {
        // Fallback for web testing
        result = {
          success: true,
          user: {
            id: '1',
            username: credentials.username,
            role: 'student',
            institution: 'Demo School'
          }
        };
      }

      if (result.success) {
        onLogin(result.user);
      } else {
        setError(result.message || 'Authentication failed');
      }
    } catch (err) {
      setError('Authentication error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="hatch-logo">H</div>
        <h2>Hatch OS</h2>
        <p>Secure Educational Environment</p>
        
        {step === 1 ? (
          <form onSubmit={handleStep1Submit} className="login-form">
            <h3>Step 1: Identity Verification</h3>
            
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={credentials.username}
                onChange={handleInputChange}
                required
                autoFocus
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleInputChange}
                required
              />
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Verifying...' : 'Next →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleFinalSubmit} className="login-form">
            <h3>Step 2: Security Verification</h3>
            
            <div className="form-group">
              <label htmlFor="pin">Security PIN</label>
              <input
                type="password"
                id="pin"
                name="pin"
                value={credentials.pin}
                onChange={handleInputChange}
                maxLength={6}
                required
                autoFocus
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="otp">OTP (Optional)</label>
              <input
                type="text"
                id="otp"
                name="otp"
                value={credentials.otp}
                onChange={handleInputChange}
                maxLength={6}
                placeholder="Leave blank if not using OTP"
              />
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" onClick={() => setStep(1)} className="back-btn">
                ← Back
              </button>
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Authenticating...' : 'Login'}
              </button>
            </div>
          </form>
        )}
        
        <div className="login-footer">
          <small>Powered by Zylon Labs Security</small>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;