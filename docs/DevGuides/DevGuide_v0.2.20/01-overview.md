# 01: Overview - Dashboard Enhancement

## Current Architecture

### Existing File Structure

```
packages/dashboard/
├── src/
│   ├── api/                    # API client layer
│   │   ├── client.ts           # Base HTTP client with auth
│   │   ├── work-orders.ts      # Work order endpoints
│   │   └── runs.ts             # Run endpoints
│   │
│   ├── components/
│   │   ├── common/             # Shared components
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── ErrorDisplay.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── ConnectionStatus.tsx
│   │   │
│   │   ├── forms/              # Form components
│   │   │   ├── WorkOrderForm.tsx
│   │   │   ├── FormField.tsx
│   │   │   ├── TextArea.tsx
│   │   │   ├── WorkspaceSourceSelect.tsx
│   │   │   └── AgentTypeSelect.tsx
│   │   │
│   │   ├── layout/             # Layout components
│   │   │   ├── Layout.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MainContent.tsx
│   │   │
│   │   ├── runs/               # Run-related components
│   │   │   ├── RunCard.tsx
│   │   │   ├── IterationCard.tsx
│   │   │   └── VerificationBadge.tsx
│   │   │
│   │   ├── streaming/          # Real-time streaming components
│   │   │   ├── RunStreamView.tsx
│   │   │   ├── AgentActivityPanel.tsx
│   │   │   ├── ProgressHeader.tsx
│   │   │   ├── EventCard.tsx
│   │   │   ├── OutputTab.tsx
│   │   │   ├── ToolCallsTab.tsx
│   │   │   ├── FilesTab.tsx
│   │   │   └── ErrorsTab.tsx
│   │   │
│   │   └── work-orders/        # Work order components
│   │       ├── WorkOrderList.tsx
│   │       ├── WorkOrderCard.tsx
│   │       ├── WorkOrderFilters.tsx
│   │       ├── StatusBadge.tsx
│   │       ├── WorkOrderHeader.tsx
│   │       ├── WorkOrderInfo.tsx
│   │       └── WorkOrderTimeline.tsx
│   │
│   ├── hooks/                  # React Query hooks
│   │   ├── useWorkOrders.ts
│   │   ├── useRuns.ts
│   │   └── useRunStream.ts
│   │
│   ├── pages/                  # Page components
│   │   ├── Dashboard.tsx
│   │   ├── WorkOrders.tsx
│   │   ├── WorkOrderDetail.tsx
│   │   ├── Runs.tsx
│   │   ├── RunDetail.tsx
│   │   ├── Settings.tsx
│   │   ├── Home.tsx
│   │   └── NotFound.tsx
│   │
│   ├── types/                  # TypeScript types
│   ├── App.tsx                 # Main app with routing
│   └── main.tsx                # Entry point
│
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

### Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | Component framework |
| TypeScript | 5.6.x | Type safety |
| Vite | 6.0.5 | Build tool and dev server |
| TailwindCSS | 3.4.17 | Utility-first CSS |
| React Query | 5.62.13 | Server state management |
| React Router | 7.1.3 | Client-side routing |
| Zod | 3.24.1 | Schema validation |
| Lucide React | latest | Icon library |

### Current Routes

| Route | Page Component | Purpose |
|-------|----------------|---------|
| `/` | Home | Redirects to dashboard |
| `/dashboard` | Dashboard | Overview with stats |
| `/work-orders` | WorkOrders | List all work orders |
| `/work-orders/:id` | WorkOrderDetail | Single work order |
| `/runs` | Runs | List all runs |
| `/runs/:id` | RunDetail | Single run with streaming |
| `/settings` | Settings | API key configuration |

---

## Target Architecture

### New File Structure (additions highlighted)

```
packages/dashboard/
├── src/
│   ├── api/
│   │   ├── client.ts
│   │   ├── work-orders.ts
│   │   ├── runs.ts
│   │   ├── profiles.ts         # NEW: Profile CRUD
│   │   ├── audit.ts            # NEW: Audit endpoints
│   │   └── health.ts           # NEW: Health endpoints
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── ... (existing)
│   │   │   └── ThemeToggle.tsx # NEW: Dark mode toggle
│   │   │
│   │   ├── profiles/           # NEW: Profile components
│   │   │   ├── ProfileCard.tsx
│   │   │   ├── ProfileForm.tsx
│   │   │   ├── ProfileList.tsx
│   │   │   ├── InheritanceTree.tsx
│   │   │   └── JsonConfigEditor.tsx
│   │   │
│   │   ├── audit/              # NEW: Audit components
│   │   │   ├── AuditTimeline.tsx
│   │   │   ├── SnapshotViewer.tsx
│   │   │   ├── ConfigDiff.tsx
│   │   │   └── AuditSection.tsx
│   │   │
│   │   ├── health/             # NEW: Health components
│   │   │   ├── HealthOverview.tsx
│   │   │   ├── DriverStatusCard.tsx
│   │   │   ├── LimitsGauge.tsx
│   │   │   └── SandboxStatus.tsx
│   │   │
│   │   ├── filters/            # NEW: Filter components
│   │   │   ├── DateRangePicker.tsx
│   │   │   ├── MultiSelect.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   └── AdvancedFilters.tsx
│   │   │
│   │   ├── runs/
│   │   │   ├── ... (existing)
│   │   │   ├── TriggerRunButton.tsx    # NEW
│   │   │   ├── IterationDetail.tsx     # NEW
│   │   │   ├── AgentOutputViewer.tsx   # NEW
│   │   │   └── VerificationDetail.tsx  # NEW
│   │   │
│   │   └── ... (existing)
│   │
│   ├── contexts/               # NEW: React contexts
│   │   └── ThemeContext.tsx
│   │
│   ├── hooks/
│   │   ├── ... (existing)
│   │   ├── useProfiles.ts      # NEW
│   │   ├── useAudit.ts         # NEW
│   │   ├── useHealth.ts        # NEW
│   │   ├── useTriggerRun.ts    # NEW
│   │   └── useFilters.ts       # NEW
│   │
│   ├── pages/
│   │   ├── ... (existing)
│   │   ├── Profiles.tsx        # NEW: Profile list
│   │   ├── ProfileDetail.tsx   # NEW: Profile edit
│   │   └── Health.tsx          # NEW: Health dashboard
│   │
│   └── ... (existing)
```

### New Routes

| Route | Page Component | Purpose |
|-------|----------------|---------|
| `/profiles` | Profiles | List all harness profiles |
| `/profiles/new` | ProfileDetail | Create new profile |
| `/profiles/:name` | ProfileDetail | View/edit profile |
| `/health` | Health | System health dashboard |

---

## Design Decisions

### 1. Profile Management Architecture

**Decision:** Create dedicated routes for profile management rather than embedding in settings.

**Rationale:**
- Profiles are complex objects with inheritance relationships
- Need dedicated space for JSON config editing
- Inheritance visualization requires significant screen real estate
- Separates concerns from simple settings like API key

**Implications:**
- New sidebar navigation item for "Profiles"
- Two new pages: list and detail/edit
- Profile form handles both create and edit modes

### 2. Audit Trail Integration

**Decision:** Embed audit information in existing pages rather than creating standalone audit page.

**Rationale:**
- Audit data is contextual to work orders and runs
- Users want to see "what config was used for this run"
- Standalone audit page would require navigation away from context
- Reduces cognitive load by keeping related information together

**Implications:**
- Add AuditSection component to WorkOrderDetail page
- Add config snapshot display to RunDetail page
- Audit timeline shows within work order context

### 3. Health Dashboard Placement

**Decision:** Create dedicated /health route accessible from sidebar.

**Rationale:**
- Health is system-wide, not contextual to specific work orders
- DevOps users need quick access to system status
- Auto-refresh capability requires dedicated view
- Should not clutter existing pages

**Implications:**
- New sidebar navigation item for "Health"
- New Health page with auto-refresh (30 second interval)
- ConnectionStatus component can link to health page

### 4. Theme Management

**Decision:** Use React Context for theme state with localStorage persistence.

**Rationale:**
- Theme preference should persist across sessions
- Need to toggle dark class on document root
- Multiple components need access to current theme
- TailwindCSS dark mode requires class-based approach

**Implications:**
- ThemeContext provides theme state and setter
- ThemeToggle component for user interaction
- All components use dark: variants for styling
- System preference detection for initial value

### 5. Filter State Management

**Decision:** Store filter state in URL query parameters.

**Rationale:**
- Filters should be shareable via URL
- Browser back/forward should respect filter changes
- Page refresh should maintain filter state
- Enables bookmarking specific filter combinations

**Implications:**
- useFilters hook syncs with URL search params
- Filter changes update URL without navigation
- Initial filter state read from URL on mount

### 6. JSON Config Editing

**Decision:** Use syntax-highlighted textarea rather than full Monaco editor.

**Rationale:**
- Monaco editor adds significant bundle size (~2MB)
- Most config edits are minor adjustments
- Syntax highlighting provides sufficient feedback
- Can add Monaco as progressive enhancement later

**Implications:**
- Lighter bundle size
- Faster initial load
- JSON validation on blur/submit
- Error messages for invalid JSON

---

## Component Design Principles

### 1. Composition Over Configuration

Components should be small and composable. A ProfileCard should not handle editing; it displays a profile and provides action buttons that trigger parent handlers.

### 2. Consistent Loading States

All data-fetching components should handle:
- Loading state (spinner or skeleton)
- Error state (error message with retry option)
- Empty state (helpful message with action)

### 3. Optimistic Updates

Mutations should update the UI immediately and rollback on error:
- Delete profile: Remove from list immediately
- Create profile: Add to list before server confirms
- Update profile: Show new values immediately

### 4. Accessibility First

All interactive elements must:
- Be keyboard accessible
- Have visible focus indicators
- Include appropriate ARIA attributes
- Maintain sufficient color contrast

### 5. Mobile-First Responsive

Design for mobile viewport first, then enhance for larger screens:
- Sidebar collapses to hamburger menu on mobile
- Tables become card lists on mobile
- Forms stack vertically on mobile

---

## State Management Strategy

### Server State (React Query)

All data from the API is managed by React Query:
- Automatic caching with configurable stale time
- Background refetching
- Optimistic updates for mutations
- Query invalidation on related mutations

### UI State (React Context)

UI-only state uses React Context:
- Theme preference (light/dark/system)
- Sidebar collapsed state
- Modal open states

### URL State

Filter and navigation state lives in URL:
- Work order filters (status, date range, etc.)
- Pagination (page, limit)
- Sort order

---

## Error Handling Strategy

### API Errors

All API errors should:
1. Log to console with full details
2. Display user-friendly message
3. Provide retry option where applicable
4. Not crash the application

### Validation Errors

Form validation errors should:
1. Display inline near the problematic field
2. Clear when user corrects the input
3. Prevent form submission until resolved

### Network Errors

Network failures should:
1. Show connection status indicator
2. Queue retries with exponential backoff
3. Notify user when connection restored
