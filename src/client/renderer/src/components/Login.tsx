import React, { useState } from 'react';
import '../styles/Login.scss';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const endpoint = isRegister ? '/api/signup' : '/api/login';
      const body = isRegister
        ? { username, email, password }
        : { username, password };

      const response = await fetch(`http://localhost:3003${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'An error occurred');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <h2>{isRegister ? 'Register' : 'Login'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          {isRegister && (
            <div className="form-group">
              <label>Email:</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
        </form>
        <button
          type="button"
          onClick={() => setIsRegister(!isRegister)}
          className="toggle-button"
        >
          {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
        </button>
        <button
          type="button"
          onClick={() => onLogin('demo-token', { id: 'demo-user', name: 'Demo User', email: 'demo@example.com' })}
          className="demo-button"
        >
          Demo
        </button>
      </div>
    </div>
  );
};

export default Login;