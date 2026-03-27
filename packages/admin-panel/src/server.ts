import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import next from 'next';
import { createServer } from 'http';
import { containerPoolManager } from '@/lib/container-pool-manager';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');
config({ path: envPath });

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`📝 Loading env from: ${envPath}`);
console.log(`🔧 PORT=${port}, HOST=${hostname}, NODE_ENV=${process.env.NODE_ENV}`);

// Create Next.js app
// Force Webpack in custom-server dev mode to avoid Turbopack persistence crashes.
const app = next({ dev, hostname, port, webpack: true });
const handle = app.getRequestHandler();

let server: ReturnType<typeof createServer>;

function isTransientManifestError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeErr = error as NodeJS.ErrnoException;
  if (maybeErr.code !== 'ENOENT') {
    return false;
  }

  const missingPath = String(maybeErr.path || '');
  return missingPath.includes('.next/dev/server') && missingPath.includes('manifest');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cleanup = () => {
  console.log('🧹 Cleaning up...');
  if (server) {
    server.close();
  }
};

app.prepare().then(() => {
  server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      if (dev && isTransientManifestError(err)) {
        try {
          await sleep(200);
          await handle(req, res);
          return;
        } catch (retryErr) {
          console.error('Retry failed handling', req.url, retryErr);
        }
      }

      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.listen(port, hostname, () => {
    console.log(`🚀 Admin Panel starting on http://${hostname}:${port}`);
    console.log(`✅ Admin Panel ready on http://${hostname}:${port}`);

    containerPoolManager.replenishPool().catch((error) => {
      console.error('⚠️  Initial pool warm-up failed:', error);
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    cleanup();
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    cleanup();
  });
});
