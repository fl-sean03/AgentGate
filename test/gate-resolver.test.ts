/**
 * Gate Resolver Integration Tests
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { resolveGatePlan } from '../src/gate/resolver.js';
import { generateGateSummary } from '../src/gate/summary.js';

const TOY_REPO_PATH = path.join(import.meta.dirname, '../test-fixtures/toy-repo');

describe('Gate Resolver', () => {
  it('should resolve gate plan from repo path', async () => {
    const gatePlan = await resolveGatePlan(TOY_REPO_PATH, { type: 'discover' });

    // Gate plan id is auto-generated
    expect(gatePlan.id).toBeDefined();
    expect(typeof gatePlan.id).toBe('string');
    expect(gatePlan.id.length).toBeGreaterThan(0);
  });

  it('should resolve gate plan from explicit path', async () => {
    const gatePlan = await resolveGatePlan(TOY_REPO_PATH, {
      type: 'path',
      path: 'gate-plan.yaml',
    });

    expect(gatePlan.id).toBeDefined();
  });

  it('should generate gate summary', async () => {
    const gatePlan = await resolveGatePlan(TOY_REPO_PATH, { type: 'discover' });
    const summary = generateGateSummary(gatePlan);

    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    // The summary includes Gate Plan info
    expect(summary).toContain('Gate Plan');
  });
});
