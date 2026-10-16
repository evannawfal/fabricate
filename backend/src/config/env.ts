import 'dotenv/config';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getOptionalEnvVar(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const rawPort = process.env.PORT;
const port =
  rawPort === undefined || rawPort === ''
    ? 3000
    : Number.parseInt(rawPort, 10);

if (Number.isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

export const env = {
  port,
  googleClientId: getEnvVar('GOOGLE_CLIENT_ID'),
  jwtAccessSecret: getEnvVar('JWT_SECRET'),
  mongodbUri: getEnvVar('MONGODB_URI'),
  // File storage is optional so the server can run without it; features that store files
  // report it as unavailable. AWS credentials are read by the AWS SDK from AWS_ACCESS_KEY_ID
  // and AWS_SECRET_ACCESS_KEY.
  storage: {
    bucket: getOptionalEnvVar('S3_BUCKET'),
    region: getOptionalEnvVar('AWS_REGION'),
    // Only for S3-compatible services other than AWS (e.g. Google Cloud Storage, MinIO).
    endpoint: getOptionalEnvVar('S3_ENDPOINT'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
} as const;
