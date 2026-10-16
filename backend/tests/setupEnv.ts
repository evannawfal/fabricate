// Placeholder values so the app can be imported in tests without a backend/.env file.
// Real values from the environment (or .env) take precedence.
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id.apps.googleusercontent.com';
process.env.JWT_SECRET ??= 'test-jwt-secret';
// Tests connect to their own in-memory database (tests/helpers/database.ts), not this URI.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/fabricate-test-unused';
// Tests never use real file storage, even if backend/.env configures it.
process.env.S3_BUCKET = '';
process.env.S3_ENDPOINT = '';
