import 'dotenv/config';

// Callers pass process.env.NAME in, because looking up process.env[name] is flagged by Codacy as object injection.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(value: string | undefined): string | undefined {
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
  googleClientId: required('GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID),
  jwtAccessSecret: required('JWT_SECRET', process.env.JWT_SECRET),
  mongodbUri: required('MONGODB_URI', process.env.MONGODB_URI),
  // File storage (Azure Blob Storage) is optional so the server can run without it;
  // features that store files report it as unavailable.
  storage: {
    // Must include the account key (needed to sign download URLs).
    connectionString: optional(process.env.AZURE_STORAGE_CONNECTION_STRING),
    container: optional(process.env.AZURE_STORAGE_CONTAINER),
  },
  // Clothing photo classification (Claude API) is optional in the same way.
  anthropicApiKey: optional(process.env.ANTHROPIC_API_KEY),
  openWeatherApiKey: optional(process.env.OPENWEATHER_API_KEY),
} as const;
