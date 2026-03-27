import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3', 'dockerode'],
  turbopack: {
    root: __dirname,
  },
  env: {
    ADMIN_PORT: '3001',
  },
};

export default nextConfig;
