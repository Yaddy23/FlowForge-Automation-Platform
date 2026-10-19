# FlowForge Automation Platform

A workflow automation SaaS platform built with React frontend, Express backend, MongoDB, and Redis/BullMQ for managing automated workflows and integrations.

## Quickstart

*(Detailed setup instructions will be added in later tasks)*

1. Install dependencies: `npm install`
2. Start development services: `npm run dev`
3. Access the application:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001/api

## Environment Setup

Copy the example environment files:
- `cp server/.env.example server/.env`
- `cp client/.env.example client/.env`

Then modify the values as needed for your environment.

## Demo Accounts

Seed the demo accounts (requires a reachable MongoDB via `MONGODB_URI`):

```
npm run seed -w server
```

| Email | Role |
|---|---|
| admin@flowforge.dev | super_admin |
| wfadmin@flowforge.dev | workflow_admin |
| builder@flowforge.dev | workflow_builder |
| viewer@flowforge.dev | viewer |

All demo accounts use the password: `Demo123!`

## API Docs

With the server running, Swagger UI is available at http://localhost:3001/api/docs