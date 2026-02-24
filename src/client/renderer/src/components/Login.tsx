import React, { useState } from 'react';
import '../styles/Login.scss';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

// Modernized auth surface with mode toggle and better ergonomics.
const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const isRegister = mode === 'register';

  // Submit credentials to the auth API and propagate the token upward.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const endpoint = isRegister ? '/api/signup' : '/api/login';
      const body = isRegister ? { username, email, password } : { username, password };

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
    <div className="login-shell">
      <div className="grid-lines" aria-hidden="true" />
      <div className="orb orb-a" aria-hidden="true" />
      <div className="orb orb-b" aria-hidden="true" />
      <div className="drag-zone" aria-hidden="true" />

      <div className="login-viewport">
        <div className="card">
          <div className="card-header">
            <p className="eyebrow">Access</p>
            <h2>{isRegister ? 'Create your Kiama ID' : 'Sign in to Kiama'}</h2>
            <p className="hint">Switch modes instantly or jump into the demo.</p>

            <div className="mode-toggle" role="tablist" aria-label="Auth mode">
              <button
                type="button"
                className={mode === 'login' ? 'active' : ''}
                onClick={() => setMode('login')}
                role="tab"
                aria-selected={mode === 'login'}
              >
                Sign in
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'active' : ''}
                onClick={() => setMode('register')}
                role="tab"
                aria-selected={mode === 'register'}
              >
                Create account
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="form">
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@example"
                autoComplete="username"
                required
              />
            </label>

            {isRegister && (
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>
            )}

            <label className="field">
              <span>Password</span>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="ghost-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {error && <div className="error" role="alert">{error}</div>}

            <button type="submit" className="primary-btn">
              {isRegister ? 'Create account' : 'Sign in'}
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => setMode(isRegister ? 'login' : 'register')}
            >
              {isRegister ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>

            <button
              type="button"
              className="outline-btn"
              onClick={() =>
                onLogin('demo-token', {
                  id: 'demo-user',
                  name: 'Demo User',
                  email: 'demo@example.com',
                })
              }
            >
              Explore with demo
            </button>

            <p className="fine-print">By continuing you agree to workspace policies and logging.</p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;