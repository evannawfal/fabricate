// Placeholder values so the app can be imported in tests without a backend/.env file.
// Real values from the environment (or .env) take precedence.
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id.apps.googleusercontent.com';
process.env.JWT_SECRET ??= 'test-jwt-secret';
