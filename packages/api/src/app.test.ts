import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import type { Express } from 'express';

describe('API', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  // ---- Health ----

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  // ---- Programs ----

  it('POST /api/programs creates a program', async () => {
    const res = await request(app)
      .post('/api/programs')
      .send({
        title: 'HVAC Modernization — Costa Mesa HQ',
        description: 'Replace legacy HVAC across Buildings 3-7 at Costa Mesa HQ to meet ASHRAE 90.1 energy targets and support cleanroom expansion',
        owner: 'marcus.webb',
        stakeholders: ['vp-facilities'],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.phase).toBe('framed');
  });

  it('POST /api/programs returns 400 without required fields', async () => {
    const res = await request(app)
      .post('/api/programs')
      .send({ title: 'Columbus Generator Replacement' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('GET /api/programs/:id returns 404 for missing program', async () => {
    const res = await request(app).get('/api/programs/nonexistent');
    expect(res.status).toBe(404);
  });

  it('GET /api/programs lists all programs', async () => {
    await request(app)
      .post('/api/programs')
      .send({ title: 'Lab Expansion — Columbus Ohio Arsenal', description: 'Build out 12,000 sqft of electronics integration lab space at Columbus Arsenal for Anvil production ramp', owner: 'david.chen' });

    const res = await request(app).get('/api/programs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('POST /api/programs/:id/advance runs phase gate', async () => {
    const create = await request(app)
      .post('/api/programs')
      .send({
        title: 'Network Infrastructure Buildout — Reston VA',
        description: 'Deploy redundant 100Gbps backbone, dark fiber interconnects, and zero-trust segmentation across Reston VA operations center',
        owner: 'sarah.mitchell',
        stakeholders: ['it-infrastructure'],
      });

    const res = await request(app).post(`/api/programs/${create.body.id}/advance`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.toPhase).toBe('scoped');
  });

  // ---- Milestones ----

  it('POST /api/programs/:id/milestones requires title', async () => {
    const create = await request(app)
      .post('/api/programs')
      .send({ title: 'Huntington Beach Perimeter Fencing', description: 'Install anti-climb fencing and thermal cameras around Huntington Beach Test Range perimeter', owner: 'rachel.torres' });

    const res = await request(app)
      .post(`/api/programs/${create.body.id}/milestones`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  // ---- RAG ----

  it('PATCH /api/programs/:id/rag updates RAG status', async () => {
    const create = await request(app)
      .post('/api/programs')
      .send({ title: 'Costa Mesa Fire Suppression Retrofit', description: 'Retrofit Buildings 3-7 with clean-agent fire suppression for electronics manufacturing areas', owner: 'marcus.webb' });

    const res = await request(app)
      .patch(`/api/programs/${create.body.id}/rag`)
      .send({ status: 'amber', reason: 'Mechanical contractor delayed — HVAC ductwork install pushed 3 weeks' });

    expect(res.status).toBe(200);
    expect(res.body.ragStatus).toBe('amber');
  });

  // ---- Dashboard ----

  it('GET /api/dashboard/scorecard returns portfolio snapshot', async () => {
    const res = await request(app).get('/api/dashboard/scorecard');
    expect(res.status).toBe(200);
    expect(res.body.portfolio).toBeDefined();
    expect(res.body.portfolio.totalPrograms).toBeDefined();
  });

  it('GET /api/dashboard/drift returns anomaly events', async () => {
    const res = await request(app).get('/api/dashboard/drift');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ---- Decisions ----

  it('POST /api/decisions validates minimum options', async () => {
    const res = await request(app)
      .post('/api/decisions')
      .send({
        title: 'Select roofing contractor for Columbus Arsenal',
        situation: 'Columbus Arsenal roof membrane failing over Lab Building 2',
        optionsConsidered: [{ option: 'Patch existing TPO membrane', pros: [], cons: [] }],
        decision: 'Patch existing TPO membrane',
        rationale: 'Lowest short-term cost',
        tradeOffs: 'May require full replacement within 18 months',
        decidedBy: 'david.chen',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('2 options');
  });

  it('GET /api/decisions/due returns overdue decisions', async () => {
    const res = await request(app).get('/api/decisions/due');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
