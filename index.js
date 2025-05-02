import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './middleware/error-handler.js';
import connectDB from './config/db.js';
// Job for analytics tracking was moved here
import { scheduleAnalyticsJob } from './jobs/analytics.js';

// Routes for different API endpoints
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chats.js';
import ticketRoutes from './routes/tickets.js';
import teamRoutes from './routes/team.js';
import chatbotRoutes from './routes/chatbot.js';
import analyticsRoutes from './routes/analytics.js';

// Load env vars
dotenv.config();

// Connect to DB
connectDB();

// Setup express
const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || [
    'https://ticketingsystem-frontend.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/bot', chatbotRoutes);
app.use('/api/analytics', analyticsRoutes);

// Production setup for serving frontend
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start background jobs
  scheduleAnalyticsJob();     // Daily stats aggregation
});

// Handle crashes gracefully
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  // server.close(() => process.exit(1));
});