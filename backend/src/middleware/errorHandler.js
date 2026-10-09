/**
 * Standard HARVIK Error Handling Middleware
 * Prevents leaking MongoDB internal errors, stack traces, or credentials.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.status || err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred.';

  // Map known error patterns to standard HARVIK codes
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = Object.values(err.errors || {})
      .map(e => e.message)
      .join(', ') || 'Validation error.';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = `Invalid format for field '${err.path}'.`;
  } else if (err.code === 11000) {
    errorCode = 'CONFLICT';
    message = 'A duplicate record already exists.';
  } else if (statusCode === 401) {
    errorCode = 'AUTH_REQUIRED';
  } else if (statusCode === 403) {
    errorCode = 'FORBIDDEN';
  } else if (statusCode === 404) {
    errorCode = 'NOT_FOUND';
  } else if (statusCode >= 500) {
    errorCode = 'INTERNAL_ERROR';
    // Sanitized in production
    if (process.env.NODE_ENV === 'production') {
      message = 'An internal system error occurred. Please try again later.';
    }
  }

  // Structured logging
  console.error(`[ERROR] [${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, {
    code: errorCode,
    message: err.message,
    status: statusCode,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
    },
  });
};

module.exports = errorHandler;
