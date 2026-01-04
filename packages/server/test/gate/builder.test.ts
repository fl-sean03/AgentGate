/**
 * Tests for Gate Plan Builder.
 * (v0.2.27 - Thrust 14: Custom Gate Type Support)
 */

import { describe, it, expect } from 'vitest';
import {
  GatePlanBuilder,
  createGatePlanBuilder,
  GatePlan_builder,
} from '../../src/gate/builder.js';

describe('GatePlanBuilder', () => {
  describe('constructor', () => {
    it('should create builder with defaults', () => {
      const builder = new GatePlanBuilder();
      expect(builder).toBeDefined();
    });

    it('should accept options', () => {
      const builder = new GatePlanBuilder({
        defaultWeight: 'high',
        failFast: false,
        maxParallel: 10,
      });
      expect(builder).toBeDefined();
    });
  });

  describe('name', () => {
    it('should set plan name', () => {
      const builder = new GatePlanBuilder();
      const result = builder.name('my-plan');
      expect(result).toBe(builder); // Fluent API
    });
  });

  describe('addVerification', () => {
    it('should add verification gate', () => {
      const builder = new GatePlanBuilder();
      builder.addVerification({ levels: ['L0', 'L1'] });

      const plan = builder.build();
      expect(plan.checks).toHaveLength(1);
      expect(plan.checks[0].type).toBe('verification-levels');
    });

    it('should use default levels', () => {
      const builder = new GatePlanBuilder();
      builder.addVerification();

      const plan = builder.build();
      expect(plan.checks[0].config?.levels).toEqual(['L0', 'L1', 'L2']);
    });

    it('should accept custom id', () => {
      const builder = new GatePlanBuilder();
      builder.addVerification({ id: 'my-verification' });

      const info = builder.getGateInfo();
      expect(info[0].id).toBe('my-verification');
    });
  });

  describe('addContract', () => {
    it('should add contract gate with L0', () => {
      const builder = new GatePlanBuilder();
      builder.addContract();

      const plan = builder.build();
      expect(plan.checks[0].config?.levels).toEqual(['L0']);
    });

    it('should default to critical weight', () => {
      const builder = new GatePlanBuilder();
      builder.addContract();

      const info = builder.getGateInfo();
      expect(info[0].weight).toBe('critical');
    });
  });

  describe('addTest', () => {
    it('should add test gate with L1', () => {
      const builder = new GatePlanBuilder();
      builder.addTest();

      const plan = builder.build();
      expect(plan.checks[0].config?.levels).toEqual(['L1']);
    });

    it('should default to high weight', () => {
      const builder = new GatePlanBuilder();
      builder.addTest();

      const info = builder.getGateInfo();
      expect(info[0].weight).toBe('high');
    });
  });

  describe('addGitHubActions', () => {
    it('should add GitHub Actions gate', () => {
      const builder = new GatePlanBuilder();
      builder.addGitHubActions({ workflow: 'ci.yml' });

      const plan = builder.build();
      expect(plan.checks[0].type).toBe('github-actions');
      expect(plan.checks[0].config?.workflow).toBe('ci.yml');
    });
  });

  describe('addCustomCommand', () => {
    it('should add custom command gate', () => {
      const builder = new GatePlanBuilder();
      builder.addCustomCommand({ command: 'npm run lint' });

      const plan = builder.build();
      expect(plan.checks[0].type).toBe('custom');
      expect(plan.checks[0].config?.command).toBe('npm run lint');
    });
  });

  describe('addConvergence', () => {
    it('should add convergence gate', () => {
      const builder = new GatePlanBuilder();
      builder.addConvergence();

      const plan = builder.build();
      expect(plan.checks[0].type).toBe('convergence');
    });
  });

  describe('addApproval', () => {
    it('should add approval gate', () => {
      const builder = new GatePlanBuilder();
      builder.addApproval({ requiredApprovers: ['user1', 'user2'] });

      const plan = builder.build();
      expect(plan.checks[0].type).toBe('approval');
      expect(plan.checks[0].config?.requiredApprovers).toEqual(['user1', 'user2']);
    });

    it('should default to critical weight', () => {
      const builder = new GatePlanBuilder();
      builder.addApproval();

      const info = builder.getGateInfo();
      expect(info[0].weight).toBe('critical');
    });
  });

  describe('addCustomGate', () => {
    it('should add gate with arbitrary type', () => {
      const builder = new GatePlanBuilder();
      builder.addCustomGate({
        type: 'verification-levels',
        config: { levels: ['L3'] },
      });

      const plan = builder.build();
      expect(plan.checks[0].type).toBe('verification-levels');
    });
  });

  describe('withDependency', () => {
    it('should add dependency between gates', () => {
      const builder = new GatePlanBuilder();
      builder
        .addContract({ id: 'contract' })
        .addTest({ id: 'test' })
        .withDependency('contract', 'test');

      const info = builder.getGateInfo();
      const testGate = info.find(g => g.id === 'test');
      expect(testGate?.dependencies).toContain('contract');
    });

    it('should throw for missing source gate', () => {
      const builder = new GatePlanBuilder();
      builder.addContract({ id: 'contract' });

      expect(() => {
        builder.withDependency('missing', 'contract');
      }).toThrow("Gate 'missing' not found");
    });

    it('should throw for missing target gate', () => {
      const builder = new GatePlanBuilder();
      builder.addContract({ id: 'contract' });

      expect(() => {
        builder.withDependency('contract', 'missing');
      }).toThrow("Gate 'missing' not found");
    });
  });

  describe('setWeight', () => {
    it('should change gate weight', () => {
      const builder = new GatePlanBuilder();
      builder
        .addTest({ id: 'test' })
        .setWeight('test', 'critical');

      const info = builder.getGateInfo();
      expect(info[0].weight).toBe('critical');
    });

    it('should throw for missing gate', () => {
      const builder = new GatePlanBuilder();

      expect(() => {
        builder.setWeight('missing', 'critical');
      }).toThrow("Gate 'missing' not found");
    });
  });

  describe('build', () => {
    it('should build empty plan', () => {
      const builder = new GatePlanBuilder();
      const plan = builder.build();

      expect(plan.checks).toEqual([]);
    });

    it('should build plan with multiple gates', () => {
      const builder = new GatePlanBuilder();
      builder
        .addContract()
        .addTest()
        .addGitHubActions();

      const plan = builder.build();
      expect(plan.checks).toHaveLength(3);
    });

    it('should order gates by dependencies', () => {
      const builder = new GatePlanBuilder();
      builder
        .addTest({ id: 'test' })
        .addContract({ id: 'contract' })
        .withDependency('contract', 'test');

      const plan = builder.build();
      const types = plan.checks.map(c => c.type);

      // Contract should come before test
      const contractIdx = types.indexOf('verification-levels');
      const testIdx = types.lastIndexOf('verification-levels');
      expect(contractIdx).toBeLessThan(testIdx);
    });

    it('should detect circular dependencies', () => {
      const builder = new GatePlanBuilder();
      builder
        .addContract({ id: 'a' })
        .addTest({ id: 'b' })
        .addGitHubActions({ id: 'c' })
        .withDependency('a', 'b')
        .withDependency('b', 'c')
        .withDependency('c', 'a');

      expect(() => {
        builder.build();
      }).toThrow('Circular dependency');
    });
  });

  describe('getGateInfo', () => {
    it('should return gate information', () => {
      const builder = new GatePlanBuilder();
      builder
        .addContract({ id: 'contract', weight: 'critical' })
        .addTest({ id: 'test', weight: 'high' });

      const info = builder.getGateInfo();

      expect(info).toHaveLength(2);
      expect(info[0]).toEqual({
        id: 'contract',
        type: 'verification-levels',
        weight: 'critical',
        dependencies: [],
      });
    });
  });
});

describe('createGatePlanBuilder', () => {
  it('should create builder', () => {
    const builder = createGatePlanBuilder();
    expect(builder).toBeInstanceOf(GatePlanBuilder);
  });
});

describe('GatePlan_builder', () => {
  it('should create builder (convenience function)', () => {
    const builder = GatePlan_builder();
    expect(builder).toBeInstanceOf(GatePlanBuilder);
  });
});

describe('Fluent API', () => {
  it('should support full fluent chain', () => {
    const plan = createGatePlanBuilder()
      .name('comprehensive-plan')
      .addContract({ id: 'contracts' })
      .addTest({ id: 'unit-tests' })
      .addGitHubActions({ id: 'ci', workflow: 'ci.yml' })
      .addApproval({ id: 'approval' })
      .withDependency('contracts', 'unit-tests')
      .withDependency('unit-tests', 'ci')
      .withDependency('ci', 'approval')
      .setWeight('ci', 'high')
      .build();

    expect(plan.checks).toHaveLength(4);
  });
});
