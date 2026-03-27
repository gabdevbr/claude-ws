# Admin Panel - Docker Pool Management

## 📋 Giới thiệu

Admin Panel là một dịch vụ riêng biệt, được tách khỏi ứng dụng chính `claude-ws`. Nó cung cấp giao diện quản lý các Docker containers và pool management.

## 🏗️ Kiến trúc

```
claude-ws/
├── packages/
│   ├── admin-panel/          # Admin Panel (separate service)
│   │   ├── src/
│   │   │   ├── app/         # Next.js App Router
│   │   │   ├── components/  # React components
│   │   │   ├── lib/         # Container pool manager
│   │   │   ├── db/          # Database setup
│   │   │   └── server.ts    # Express server
│   │   ├── Dockerfile       # Docker image
│   │   ├── package.json     # Dependencies
│   │   └── .env.example     # Environment template
│   └── agentic-sdk/         # Main application
└── docker-compose.yml       # Orchestrate both services
```

## 🚀 Cách sử dụng

### 1. Development (Local)

```bash
# Chạy Admin Panel độc lập
cd packages/admin-panel
pnpm install
pnpm dev  # Chạy trên port 3001
```

### 2. Production (Docker)

```bash
# Xây dựng và chạy cả 2 services
docker-compose up -d

# Kiểm tra status
docker-compose ps

# Xem logs
docker-compose logs -f admin-panel
```

## 🔗 Ports

- **Admin Panel**: http://localhost:3001
- **Main App**: http://localhost:8053

## 🔑 Environment Variables

Copy `.env.example` sang `.env` và cấu hình:

```bash
cd packages/admin-panel
cp .env.example .env
```

Các biến quan trọng:
- `PORT=3001` - Port của Admin Panel
- `API_ACCESS_KEY` - API key để authenticate
- `POOL_SIZE=5` - Số container trong pool
- `IDLE_TIMEOUT_SECONDS=86400` - Timeout (24h)

## 📡 API Endpoints

### Admin API

- `GET /api/admin/dashboard` - Dashboard summary
- `GET /api/admin/projects` - List projects
- `POST /api/admin/projects` - Create project
- `GET /api/admin/projects/:id` - Get project details
- `DELETE /api/admin/projects/:id` - Delete project
- `POST /api/admin/projects/:id/stop` - Stop project

## 🎨 UI Features

- Glassmorphism design với backdrop blur
- Pool status cards với gradients
- Real-time project status
- Container management interface

## 🔧 Scripts

```bash
pnpm dev              # Development server
pnpm build            # Build for production
pnpm start            # Production server
pnpm db:generate      # Generate DB migrations
pnpm db:migrate       # Run migrations
```

## 🐳 Docker Commands

```bash
# Build image
docker build -t claude-admin-panel ./packages/admin-panel

# Run container
docker run -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file .env \
  claude-admin-panel

# Or use docker-compose
docker-compose up admin-panel
```

## 📝 License

MIT
