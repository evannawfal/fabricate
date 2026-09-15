import express, { type Express, type Request, type Response } from 'express';

// The server's public IP rarely changes, so resolve it once and reuse it.
let cachedServerIp: string | null = null;

async function getServerPublicIp(): Promise<string> {
  if (cachedServerIp !== null) {
    return cachedServerIp;
  }
  const response = await fetch('https://api.ipify.org?format=json');
  const data = (await response.json()) as { ip: string };
  cachedServerIp = data.ip;
  return cachedServerIp;
}

// Formats a date as "hh:mm:ss GMT+hh:mm" in the server's local time zone.
function formatTimeWithOffset(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  // getTimezoneOffset() returns minutes the local zone is BEHIND UTC,
  // so negate it to get the conventional GMT offset sign.
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteMinutes / 60));
  const offsetMins = pad(absoluteMinutes % 60);

  return `${hours}:${minutes}:${seconds} GMT${sign}${offsetHours}:${offsetMins}`;
}

export function createApp(): Express {
  const app = express();

  // So req.ip reflects the real client when behind a reverse proxy.
  app.set('trust proxy', true);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Button 1: the server's public IP address.
  app.get('/api/server-ip', async (_req: Request, res: Response) => {
    try {
      const ip = await getServerPublicIp();
      res.json({ ip });
    } catch {
      res.status(500).json({ error: 'Could not determine server IP' });
    }
  });

  // Button 1: the server's local time as "hh:mm:ss GMT+hh:mm".
  app.get('/api/server-time', (_req: Request, res: Response) => {
    res.json({ time: formatTimeWithOffset(new Date()) });
  });

  // Button 1: the app owner's name, returned via a back-end API (per the spec).
  app.get('/api/name', (_req: Request, res: Response) => {
    res.json({ first: 'Evan', last: 'Nawfal' });
  });

  // Button 1: the client's IP address as observed by the server.
  app.get('/api/client-ip', (req: Request, res: Response) => {
    res.json({ ip: req.ip });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
