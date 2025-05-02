import winston from 'winston';

// Setup logging system
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'ticket-management-api' },
  transports: [
    // Error logs go to error.log
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // All logs go to combined.log
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Custom error for API responses
class APIError extends Error {
  constructor(message, statusCode, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log all errors
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.user ? req.user.id : 'unauthenticated'
  });
  
  // Set default error info
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server Error';
  let errors = err.errors || [];
  
  // Handle common error types
  
  // Form validation failed
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).map(val => val.message);
  }
  
  // Database unique constraint violation
  if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate Field Value';
    errors = [`Duplicate field value: ${JSON.stringify(err.keyValue)}`];
  }
  
  // Invalid MongoDB ID format
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID';
    errors = [`Invalid ${err.path}: ${err.value}`];
  }
  
  // Bad token
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  
  // Token expired
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }
  
  // Return error to client
  res.status(statusCode).json({
    success: false,
    message,
    errors: errors.length > 0 ? errors : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// Wrap async functions to auto-catch errors
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Export
export {
  logger,
  APIError,
  errorHandler,
  asyncHandler
};