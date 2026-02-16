# Verba

A self-hostable, open-source i18n (internationalization) collaboration tool with structured workflow and approval system.

## Features

- 🌍 **Multi-locale Support**: Manage translations for multiple languages
- 📁 **Projects & Namespaces**: Organize translations hierarchically
- 🔄 **Workflow States**: TODO → IN_PROGRESS → SUBMITTED → APPROVED
- 🔐 **Role-based Access Control**: ADMIN, MAINTAINER, TRANSLATOR, READER roles
- 🔒 **Namespace ACL**: Fine-grained access control at namespace level
- 💬 **Comments**: Collaborate with team members on translations
- 📊 **Audit Logs**: Track all changes and state transitions
- 📥 **Import/Export**: CSV import and approved JSON export
- 🎨 **Modern UI**: Built with Vue 3, TypeScript, and SCSS

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + SCSS + Vite
- **Backend**: Node.js + TypeScript + Fastify
- **Database**: Prisma (SQLite for dev, PostgreSQL for production)
- **Deployment**: Docker Compose
- **Monorepo**: pnpm workspace

## Architecture

### Database Schema

- **Users**: Authentication and user management
- **Projects**: Top-level containers for translations
- **Namespaces**: Logical grouping of translation keys
- **Keys**: Flat translation keys (e.g., "welcome.message")
- **Locales**: Language configurations (e.g., en, es, fr)
- **Translations**: Key-locale pairs with workflow states
- **Comments**: Discussion threads on translations
- **Audit Logs**: Complete change history

### Workflow

1. **TODO**: Initial state for new translations
2. **IN_PROGRESS**: Translator is working on it
3. **SUBMITTED**: Translation ready for review
4. **APPROVED**: Translation approved and ready for export

### Roles & Permissions

- **ADMIN**: Full access, can manage project members
- **MAINTAINER**: Can approve translations, manage namespaces
- **TRANSLATOR**: Can create and edit translations
- **READER**: Read-only access

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose (for production)

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/nubisco/verba.git
cd verba
```

2. Install dependencies:
```bash
pnpm install
```

3. Setup environment variables for server:
```bash
cd packages/server
cp .env.example .env
# Edit .env with your configuration
```

4. Generate Prisma client and run migrations:
```bash
pnpm prisma:generate
pnpm prisma:migrate
```

5. Start development servers:
```bash
# From root directory
pnpm dev
```

This will start:
- Backend API at http://localhost:3001
- Frontend UI at http://localhost:3000

### Production Deployment with Docker

1. Create production environment file:
```bash
cp packages/server/.env.example packages/server/.env
# Update DATABASE_URL for PostgreSQL
# Set a strong JWT_SECRET
```

2. Start with Docker Compose:
```bash
docker-compose up -d
```

This will start:
- PostgreSQL database
- Backend API
- Frontend application

Access the application at http://localhost:3000

## API Overview

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `POST /api/projects/:id/members` - Add project member

### Namespaces
- `GET /api/projects/:projectId/namespaces` - List namespaces
- `POST /api/projects/:projectId/namespaces` - Create namespace
- `GET /api/namespaces/:id` - Get namespace details
- `POST /api/namespaces/:id/access` - Add namespace access

### Keys & Translations
- `GET /api/namespaces/:namespaceId/keys` - List keys
- `POST /api/namespaces/:namespaceId/keys` - Create key
- `POST /api/keys/:keyId/translations` - Create translation
- `PATCH /api/translations/:id` - Update translation

### Comments
- `GET /api/translations/:translationId/comments` - List comments
- `POST /api/translations/:translationId/comments` - Add comment

### Import/Export
- `POST /api/projects/:projectId/import` - Import CSV
- `GET /api/projects/:projectId/export` - Export approved JSON

### Audit Logs
- `GET /api/projects/:projectId/audit` - Get audit logs

## Testing

Run tests:
```bash
pnpm test
```

## Project Structure

```
verba/
├── packages/
│   ├── server/              # Backend API
│   │   ├── prisma/          # Database schema
│   │   └── src/
│   │       ├── acl.service.ts         # Access control logic
│   │       ├── prisma.service.ts      # Database operations
│   │       ├── import-export.service.ts
│   │       ├── app.ts                 # Fastify routes
│   │       └── __tests__/             # Tests
│   └── client/              # Vue frontend
│       └── src/
│           ├── views/       # Page components
│           ├── services/    # API client
│           └── App.vue
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Security

### Secure by Design

**Security Measures:**
- ✅ JWT secret validation (fails in production without proper secret)
- ✅ Password hashing with bcrypt
- ✅ Server-side ACL enforcement on all endpoints
- ✅ Audit logging for accountability
- ✅ Fastify 5.7.2+ (fixes Content-Type header vulnerability)
- ✅ File size limits (10MB) for imports
- ✅ CSV-only import (no vulnerable xlsx dependency)

**Import Functionality:**
- Only CSV import is supported (secure, no known vulnerabilities)
- XLSX import was intentionally removed due to unpatched security vulnerabilities in the xlsx library
- Users can convert XLSX to CSV before importing
- File size limited to 10MB to prevent DoS attacks

**Recommendations:**
- Only allow trusted users (MAINTAINER role or higher) to import files
- Review audit logs regularly
- Keep dependencies updated
- Use strong JWT secrets in production

## Known Limitations

- **XLSX Import**: Not supported due to security vulnerabilities in xlsx library. Use CSV instead.
- **SQLite**: Development only. Use PostgreSQL for production.

## License

MIT License - see LICENSE file for details
