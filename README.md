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

## Webhook Triggers (Task 15)

The platform now supports webhook triggers with the following security features:

- **Unique Token Authentication**: Bearer token, query parameter, or custom header (X-Webhook-Token)
- **HMAC Signature Verification**: SHA-256 with constant-time comparison to prevent timing attacks
- **Rate Limiting**: Configurable requests per time window (default: 100 requests/minute)
- **IP Filtering**: Optional allowed IPs/CIDR ranges for additional security
- **Custom Webhook IDs**: Ability to specify custom webhook IDs for easier integration
- **Signature Verification Toggle**: Enable/disable HMAC verification as needed

Webhook triggers can be added to workflows and will automatically create workflow runs when valid webhook requests are received.

## Dashboard & Analytics

The platform includes a real-time dashboard with Recharts charts showing:

- Workflow execution statistics (total runs, success rate, currently running, failed runs)
- Daily workflow run trends (last 7 days)
- Trigger type distribution (manual, schedule, event, webhook)
- Recent workflow activity with status indicators

Access the dashboard at the root path: http://localhost:5173