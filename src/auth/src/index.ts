import express from 'express';
import * as path from 'path';
import { AuthServer } from './authServer';

const app = express();
const port = process.env.PORT || 3003;

// Initialize auth server
const authServer = new AuthServer();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(process.cwd(), 'src/auth/public')));

// API routes
app.use('/api', authServer.getRouter());

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/auth/public/index.html'));
});

// Start server
app.listen(port, () => {
  console.log(`KIAMA Auth Test Server running on port ${port}`);
  console.log(`Visit http://localhost:${port} to test authentication`);
});