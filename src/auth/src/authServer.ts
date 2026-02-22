import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

/** Describes a persisted user record on disk. */
interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  lastLogin?: Date;
}

/** JWT payload used for stateless authentication. */
interface AuthToken {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

/** Minimal auth server that handles signup/login and token verification. */
export class AuthServer {
  private users: Map<string, User> = new Map();
  private usersFile: string;
  private jwtSecret: string = 'kiama-test-secret-key-change-in-production';

  constructor() {
    this.usersFile = path.join(process.cwd(), 'src/auth/data/users.json');
    this.loadUsers();
  }

  /** Load users from disk into memory so authentication is fast. */
  private loadUsers() {
    try {
      if (fs.existsSync(this.usersFile)) {
        const data = fs.readFileSync(this.usersFile, 'utf8');
        const usersArray: User[] = JSON.parse(data);
        this.users = new Map(usersArray.map(user => [user.id, user]));
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  /** Persist the in-memory user map to disk. */
  private saveUsers() {
    try {
      const usersArray = Array.from(this.users.values());
      fs.writeFileSync(this.usersFile, JSON.stringify(usersArray, null, 2));
    } catch (error) {
      console.error('Error saving users:', error);
    }
  }

  /** Create a signed JWT for the supplied user. */
  private generateToken(user: User): string {
    const payload: AuthToken = {
      userId: user.id,
      username: user.username
    };

    return jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' });
  }

  /** Validate and decode a JWT; returns null when verification fails. */
  private verifyToken(token: string): AuthToken | null {
    try {
      return jwt.verify(token, this.jwtSecret) as AuthToken;
    } catch (error) {
      return null;
    }
  }

  /** Build the Express router that exposes auth endpoints. */
  public getRouter(): express.Router {
    const router = express.Router();

    // Signup endpoint
    router.post('/signup', async (req, res) => {
      try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
          return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        // Check if user already exists
        const existingUser = Array.from(this.users.values()).find(
          user => user.username === username || user.email === email
        );

        if (existingUser) {
          return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const user: User = {
          id: uuidv4(),
          username,
          email,
          passwordHash,
          createdAt: new Date()
        };

        this.users.set(user.id, user);
        this.saveUsers();

        // Generate token
        const token = this.generateToken(user);

        res.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email
          },
          token
        });
      } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Login endpoint
    router.post('/login', async (req, res) => {
      try {
        const { username, password } = req.body;

        if (!username || !password) {
          return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user
        const user = Array.from(this.users.values()).find(
          user => user.username === username || user.email === username
        );

        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        user.lastLogin = new Date();
        this.saveUsers();

        // Generate token
        const token = this.generateToken(user);

        res.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email
          },
          token
        });
      } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Verify token endpoint
    router.post('/verify', (req, res) => {
      try {
        const { token } = req.body;

        if (!token) {
          return res.status(400).json({ error: 'Token is required' });
        }

        const decoded = this.verifyToken(token);
        if (!decoded) {
          return res.status(401).json({ error: 'Invalid token' });
        }

        const user = this.users.get(decoded.userId);
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email
          }
        });
      } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get all users (for testing)
    router.get('/users', (req, res) => {
      const users = Array.from(this.users.values()).map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }));

      res.json({ users });
    });

    return router;
  }
}