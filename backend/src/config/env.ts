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
  // File storage (Azure Blob Storage) is optional so the server can run without it;
  // features that store files report it as unavailable.
  storage: {
    // Must include the account key (needed to sign download URLs).
    connectionString: getOptionalEnvVar('AZURE_STORAGE_CONNECTION_STRING'),
    container: getOptionalEnvVar('AZURE_STORAGE_CONTAINER'),
  },
  // Clothing photo classification (Claude API) is optional in the same way.
  anthropicApiKey: getOptionalEnvVar('ANTHROPIC_API_KEY'),
  // Without it, outfits are generated without the weather.
  openWeatherApiKey: getOptionalEnvVar('OPENWEATHER_API_KEY'),
} as const;
