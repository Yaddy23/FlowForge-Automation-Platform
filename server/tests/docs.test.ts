import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('GET /api/docs', () => {
  it('serves the Swagger UI HTML', async () => {
    const res = await request(app).get('/api/docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('serves the OpenAPI JSON resource used by the UI', async () => {
    const res = await request(app).get('/api/docs/swagger-ui-init.js');
    expect(res.status).toBe(200);
  });
});
