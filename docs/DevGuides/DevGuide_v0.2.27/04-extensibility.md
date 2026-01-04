# 04: Extensibility Framework Thrusts

These thrusts establish patterns and infrastructure for extending AgentGate's capabilities. They enable future features to be added cleanly without modifying core code.

---

## Thrust 11: Configuration Registry System

### 11.1 Objective

Create a centralized, type-safe configuration registry that supports dynamic updates, validation, and hierarchical overrides.

### 11.2 Background

Current configuration is scattered:

- Environment variables mixed with file config
- Hardcoded defaults in multiple files
- No runtime configuration changes
- No validation of configuration values
- No visibility into effective configuration

### 11.3 Subtasks

#### 11.3.1 Create Configuration Schema

Create `src/config/schema.ts`:

- Define Zod schemas for all configuration sections
- Sections: server, execution, sandbox, github, harness, logging
- Each field has type, default, description, validation
- Support nested configuration objects

#### 11.3.2 Create Configuration Registry

Create `src/config/registry.ts`:

- Singleton registry for all configuration
- `get<T>(path: string)` - Get config value with type
- `set(path: string, value: T)` - Update config at runtime
- `reset(path: string)` - Reset to default
- `getAll()` - Dump entire configuration

Configuration sources in priority order:
1. Runtime updates (highest)
2. Environment variables
3. Config file (~/.agentgate/config.yaml)
4. Defaults (lowest)

#### 11.3.3 Implement Configuration Loader

Create `src/config/loader.ts`:

- Load configuration from all sources
- Validate against schema
- Report validation errors with helpful messages
- Support hot reload of config file

#### 11.3.4 Create Configuration Endpoint

Add API endpoint `/api/v1/config`:

- GET - Return current configuration (redacted secrets)
- PATCH - Update runtime configuration
- POST /reset - Reset to defaults

Authentication required for modification.

#### 11.3.5 Add Configuration CLI

Add CLI commands:

- `agentgate config get <path>` - Get config value
- `agentgate config set <path> <value>` - Set config value
- `agentgate config list` - List all configuration
- `agentgate config reset` - Reset to defaults
- `agentgate config validate` - Validate current config

#### 11.3.6 Migrate Existing Configuration

Migrate all existing configuration to registry:

- Replace direct env var access with `config.get()`
- Remove hardcoded defaults (move to schema)
- Update documentation for new config format

### 11.4 Verification Steps

1. Start server with default configuration
2. Use CLI to view current config
3. Modify config via CLI
4. Verify change takes effect
5. Modify via API
6. Verify change persists across restart (if file-backed)
7. Test invalid configuration rejection
8. Run `pnpm test` - all tests pass

### 11.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/config/schema.ts` | Created | Configuration schema |
| `src/config/registry.ts` | Created | Configuration registry |
| `src/config/loader.ts` | Created | Configuration loader |
| `src/config/registry.test.ts` | Created | Registry tests |
| `src/server/routes/config.ts` | Created | Config API endpoints |
| `src/control-plane/commands/config.ts` | Created | Config CLI commands |
| `src/config/index.ts` | Modified | Export new config system |

---

## Thrust 12: Plugin Architecture Foundation

### 12.1 Objective

Create a plugin system that allows extending AgentGate functionality without modifying core code.

### 12.2 Background

Currently, adding new capabilities requires:

- Modifying core files
- Understanding complex dependencies
- Risk of breaking existing functionality

A plugin system allows:

- External packages to extend functionality
- Clear extension points
- Isolation between plugins
- Independent testing and deployment

### 12.3 Subtasks

#### 12.3.1 Define Plugin Interface

Create `src/plugins/types.ts`:

- `Plugin` interface with lifecycle methods
  - `name: string` - Unique plugin identifier
  - `version: string` - Semantic version
  - `initialize(context: PluginContext)` - Called on load
  - `destroy()` - Called on unload
  - `health()` - Health check

- `PluginContext` interface
  - Access to configuration registry
  - Access to event bus
  - Logger scoped to plugin
  - Registration methods for extension points

#### 12.3.2 Create Plugin Manager

Create `src/plugins/manager.ts`:

- `loadPlugin(path: string)` - Load plugin from file/package
- `unloadPlugin(name: string)` - Unload and cleanup plugin
- `getPlugin(name: string)` - Get loaded plugin
- `listPlugins()` - List all loaded plugins
- Dependency resolution between plugins

#### 12.3.3 Define Extension Points

Create extension point registry:

- `agent-driver` - Custom agent implementations
- `verification-level` - Custom verification levels
- `gate-runner` - Custom gate types
- `feedback-formatter` - Custom feedback formats
- `delivery-handler` - Custom delivery mechanisms
- `sandbox-provider` - Custom sandbox types

Each extension point defines its interface and registration method.

#### 12.3.4 Create Plugin Discovery

Implement plugin discovery:

- Scan `~/.agentgate/plugins/` directory
- Scan `node_modules` for `agentgate-plugin-*` packages
- Load plugins in dependency order
- Handle plugin errors gracefully

#### 12.3.5 Add Plugin CLI

Add CLI commands:

- `agentgate plugins list` - List installed plugins
- `agentgate plugins install <package>` - Install plugin
- `agentgate plugins uninstall <name>` - Uninstall plugin
- `agentgate plugins enable <name>` - Enable disabled plugin
- `agentgate plugins disable <name>` - Disable without uninstall

#### 12.3.6 Create Example Plugin

Create `examples/plugins/hello-world/`:

- Simple plugin that logs on initialization
- Registers a custom feedback formatter
- Demonstrates plugin lifecycle
- Includes plugin documentation

### 12.4 Verification Steps

1. Install example plugin via CLI
2. Start server, verify plugin loaded
3. Verify plugin appears in plugin list
4. Trigger plugin functionality
5. Disable plugin, verify it stops working
6. Uninstall plugin, verify cleanup
7. Run `pnpm test` - all tests pass

### 12.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/plugins/types.ts` | Created | Plugin interfaces |
| `src/plugins/manager.ts` | Created | Plugin lifecycle management |
| `src/plugins/manager.test.ts` | Created | Plugin manager tests |
| `src/plugins/discovery.ts` | Created | Plugin discovery |
| `src/plugins/extension-points.ts` | Created | Extension point registry |
| `src/control-plane/commands/plugins.ts` | Created | Plugin CLI commands |
| `examples/plugins/hello-world/` | Created | Example plugin |

---

## Thrust 13: Event Bus for Observability

### 13.1 Objective

Create an internal event bus that enables plugins and core components to react to system events.

### 13.2 Background

Currently, there's no standard way to:

- React to work order state changes
- Track execution progress
- Integrate with external monitoring
- Add custom logging/metrics

### 13.3 Subtasks

#### 13.3.1 Create Event Bus

Create `src/events/bus.ts`:

- `EventBus` class with pub/sub functionality
- `emit(event: Event)` - Publish event
- `on(type: string, handler)` - Subscribe to event type
- `off(type: string, handler)` - Unsubscribe
- `once(type: string, handler)` - One-time subscription

Support async handlers and error isolation.

#### 13.3.2 Define Core Events

Create `src/events/types.ts`:

- `WorkOrderEvent` - Submitted, started, completed, failed
- `RunEvent` - State changed, iteration completed
- `VerificationEvent` - Started, level completed, failed
- `AgentEvent` - Started, output, completed
- `SandboxEvent` - Created, executing, destroyed
- `SystemEvent` - Started, shutdown, error

Each event includes timestamp, correlation ID, and relevant context.

#### 13.3.3 Integrate with Core Components

Add event emission to:

- Orchestrator - work order and run events
- Execution engine - phase events
- Verifier - verification events
- Agent drivers - agent activity events
- Sandbox manager - sandbox lifecycle events

#### 13.3.4 Create Event Logger

Create event logging handler:

- Subscribes to all events
- Logs in structured format
- Configurable verbosity per event type
- Supports log shipping (stdout, file, remote)

#### 13.3.5 Create Metrics Collector

Create metrics handler:

- Subscribes to relevant events
- Tracks counters, gauges, histograms
- Exposes Prometheus-compatible endpoint
- Tracks: work order counts, latencies, error rates

#### 13.3.6 Add Event Replay

Implement event replay for debugging:

- Store events to file (configurable)
- `agentgate events replay <file>` - Replay events
- Useful for reproducing issues
- Include timestamp and ordering

### 13.4 Verification Steps

1. Start server with event logging enabled
2. Submit work order
3. Verify all lifecycle events logged
4. Check Prometheus endpoint for metrics
5. Verify event correlation IDs consistent
6. Test event replay functionality
7. Run `pnpm test` - all tests pass

### 13.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/events/bus.ts` | Created | Event bus implementation |
| `src/events/types.ts` | Created | Event type definitions |
| `src/events/bus.test.ts` | Created | Event bus tests |
| `src/events/logger.ts` | Created | Event logging handler |
| `src/events/metrics.ts` | Created | Metrics collection |
| `src/orchestrator/orchestrator.ts` | Modified | Emit events |
| `src/execution/engine.ts` | Modified | Emit events |
| `src/verifier/runner.ts` | Modified | Emit events |
| `src/server/routes/metrics.ts` | Created | Metrics endpoint |

---

## Thrust 14: Custom Gate Type Support

### 14.1 Objective

Enable registration of custom gate types beyond the built-in verification levels.

### 14.2 Background

Built-in gates (L0-L3) don't cover all use cases:

- Security scanning
- Performance benchmarks
- Custom compliance checks
- Integration with external tools

### 14.3 Subtasks

#### 14.3.1 Create Gate Type Interface

Create `src/gate/types.ts`:

- `GateType` interface
  - `name: string` - Unique gate identifier
  - `description: string` - Human-readable description
  - `run(context: GateContext): Promise<GateResult>` - Execute gate
  - `validate(config: unknown): boolean` - Validate gate config

- `GateContext` includes workspace path, run info, previous results
- `GateResult` includes pass/fail, diagnostics, artifacts

#### 14.3.2 Create Gate Registry

Create `src/gate/registry.ts`:

- `registerGate(type: GateType)` - Register new gate type
- `getGate(name: string)` - Get registered gate
- `listGates()` - List all gates
- `unregisterGate(name: string)` - Remove gate

Built-in gates registered at startup.

#### 14.3.3 Update Gate Plan Schema

Extend gate plan schema:

- Support custom gate types by name
- Custom gates can have arbitrary configuration
- Validation uses registered gate's validator
- Ordering/dependencies between gates

#### 14.3.4 Create Gate Plan Builder

Create fluent API for building gate plans:

- `GatePlan.builder()`
  - `.addContract(...)`
  - `.addTest(...)`
  - `.addCustomGate(name, config)`
  - `.withDependency(from, to)`
  - `.build()`

#### 14.3.5 Implement Gate Result Aggregation

Improve result aggregation:

- Collect results from all gates
- Handle partial failures (some gates pass, some fail)
- Support gate weights (critical vs advisory)
- Generate unified feedback from all gates

#### 14.3.6 Create Example Custom Gates

Create examples in `examples/gates/`:

- `security-scan` - Runs security scanner
- `bundle-size` - Checks bundle size limits
- `api-contract` - Validates OpenAPI compliance

### 14.4 Verification Steps

1. Register custom "echo" gate
2. Create gate plan using custom gate
3. Run work order with custom gate
4. Verify custom gate executed
5. Verify results included in feedback
6. Test gate with dependencies
7. Run `pnpm test` - all tests pass

### 14.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/gate/types.ts` | Modified | Add gate type interface |
| `src/gate/registry.ts` | Created | Gate type registry |
| `src/gate/registry.test.ts` | Created | Registry tests |
| `src/gate/builder.ts` | Created | Gate plan builder |
| `src/gate/aggregator.ts` | Created | Result aggregation |
| `src/types/gate-plan.ts` | Modified | Support custom gates |
| `examples/gates/` | Created | Example custom gates |

---

## Thrust 15: Agent Capability Negotiation

### 15.1 Objective

Enable agents to declare their capabilities and have tasks matched appropriately.

### 15.2 Background

Different agents have different capabilities:

- Some can use network, others can't
- Some support specific tools (browser, database)
- Some have file size or token limits
- Some work better with certain languages

Currently, all agents are treated identically.

### 15.3 Subtasks

#### 15.3.1 Define Capability Schema

Create `src/agent/capabilities.ts`:

- `Capability` interface with name, version, config
- Standard capabilities:
  - `network` - Can make network requests
  - `filesystem` - File read/write limits
  - `browser` - Browser automation
  - `shell` - Shell command execution
  - `languages` - Supported programming languages
  - `tools` - Available tools (MCP servers, etc.)

#### 15.3.2 Add Capability Declaration to Drivers

Modify agent drivers to declare capabilities:

- Each driver exports `getCapabilities()` method
- Capabilities can vary based on configuration
- Runtime capability checks

#### 15.3.3 Create Capability Matcher

Create `src/agent/matcher.ts`:

- `matchAgent(requirements, agents)` - Find matching agent
- `canFulfill(agent, requirements)` - Check if agent can fulfill
- `getReason(agent, requirements)` - Explain why agent can/can't

Requirements come from work order or harness profile.

#### 15.3.4 Integrate with Work Order Submission

When work order submitted:

- Extract capability requirements from task and config
- Match against available agents
- Select best matching agent
- Reject if no agent can fulfill

#### 15.3.5 Add Capability Discovery Endpoint

Add API endpoint `/api/v1/agents/capabilities`:

- List all registered agents with capabilities
- Filter by capability
- Check if task requirements can be fulfilled

#### 15.3.6 Update Harness Profile

Extend harness profile:

- `agent.requiredCapabilities` - Must have these capabilities
- `agent.preferredCapabilities` - Prefer agents with these
- `agent.forbiddenCapabilities` - Exclude agents with these

### 15.4 Verification Steps

1. Query agent capabilities endpoint
2. Verify each driver reports accurate capabilities
3. Submit work order requiring network
4. Verify agent with network capability selected
5. Submit work order forbidding network
6. Verify agent without network selected
7. Submit impossible requirements
8. Verify clear rejection with reason
9. Run `pnpm test` - all tests pass

### 15.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/agent/capabilities.ts` | Created | Capability definitions |
| `src/agent/matcher.ts` | Created | Capability matching |
| `src/agent/matcher.test.ts` | Created | Matcher tests |
| `src/agent/claude-code-driver.ts` | Modified | Declare capabilities |
| `src/agent/claude-code-subscription-driver.ts` | Modified | Declare capabilities |
| `src/server/routes/agents.ts` | Created | Capabilities endpoint |
| `src/types/harness-config.ts` | Modified | Add capability config |

---

## Phase 3 Completion Checklist

- [ ] Thrust 11: Configuration registry operational
- [ ] Thrust 12: Plugin system loading and managing plugins
- [ ] Thrust 13: Event bus emitting and handling events
- [ ] Thrust 14: Custom gates can be registered and executed
- [ ] Thrust 15: Agent capabilities matched to requirements
- [ ] All existing tests still pass
- [ ] No new lint warnings
- [ ] Example plugin working end-to-end

---

**Next**: [05-developer-experience.md](./05-developer-experience.md) - Developer Experience Thrusts
