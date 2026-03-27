# Cài đặt Admin Panel

## 🚀 Quick Start

### Bước 1: Cài đặt dependencies

```bash
cd packages/admin-panel
pnpm install
```

### Bước 2: Tạo file .env

```bash
cp .env.example .env
```

Hoặc chạy script setup:

```bash
cd ../..
./setup-admin.sh
```

### Bước 3: Khởi động server

```bash
# Development mode
pnpm dev

# Production mode
pnpm build
pnpm start
```

## 🐳 Chạy với Docker

### Xây dựng image

```bash
docker build -t claude-admin-panel ./packages/admin-panel
```

### Chạy container

```bash
docker run -d \
  --name claude-admin-panel \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file ./packages/admin-panel/.env \
  claude-admin-panel
```

### Hoặc dùng Docker Compose

```bash
# Chạy cả 2 services
docker-compose up -d

# Chỉ chạy admin panel
docker-compose up admin-panel

# Xem logs
docker-compose logs -f admin-panel

# Dừng
docker-compose down
```

## 🔗 Truy cập

- **Admin UI**: http://localhost:3001/admin
- **Health Check**: http://localhost:3001/api/health
- **Dashboard API**: http://localhost:3001/api/admin/dashboard

## 📝 Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Authentication
API_ACCESS_KEY=your-secret-key-here

# Database
DATABASE_PATH=/app/data/admin.db

# Docker
DOCKER_SOCKET_PATH=/var/run/docker.sock

# Pool Configuration
POOL_SIZE=5
IDLE_TIMEOUT_SECONDS=86400

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## 🔧 Scripts

```bash
pnpm dev              # Development server (port 3001)
pnpm build            # Build for production
pnpm start            # Production server
pnpm db:generate      # Generate database migrations
pnpm db:migrate       # Run migrations
```

## 🐛 Troubleshooting

### Port đã được sử dụng

```bash
# Tìm process đang dùng port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

### Database error

```bash
# Xóa database và tạo lại
rm data/admin.db
pnpm dev
```

### Docker permission

```bash
# Thêm user vào docker group
sudo usermod -aG docker $USER

# Logout và login lại
```

## 📚 API Documentation

### Authentication

Tất cả API requests cần header:

```bash
x-api-key: your-api-key-here
```

### Endpoints

#### Dashboard
```bash
GET /api/admin/dashboard
```

#### Projects
```bash
GET    /api/admin/projects      # List projects
POST   /api/admin/projects      # Create project
GET    /api/admin/projects/:id  # Get project details
DELETE /api/admin/projects/:id  # Delete project
POST   /api/admin/projects/:id/stop  # Stop project
```

## 🎨 UI Features

- Glassmorphism design
- Pool status tracking
- Container management
- Real-time updates
- Activity logs

## 📞 Support

Nếu gặp vấn đề, vui lòng:

1. Check logs: `docker-compose logs admin-panel`
2. Check environment variables
3. Verify Docker socket access
4. Check API key authentication
