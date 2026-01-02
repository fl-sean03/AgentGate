# 14: Execution Plan

## Phase Summary

| Phase | Thrusts | Focus Area | Estimated Files |
|-------|---------|------------|-----------------|
| 1 | 1-3 | Profile Management | 15 files |
| 2 | 4-6 | Audit & Observability | 18 files |
| 3 | 7-10 | Run Control & UX | 25 files |

---

## Phase 1: Profile Management

### Thrust 1: Profile List Page

**New Files:**
- `src/pages/Profiles.tsx`
- `src/components/profiles/ProfileList.tsx`
- `src/components/profiles/ProfileCard.tsx`
- `src/components/profiles/InheritanceTree.tsx`

**Modified Files:**
- `src/App.tsx` (add route)
- `src/components/layout/Sidebar.tsx` (add nav item)

**Acceptance Criteria:**
- [ ] Navigate to /profiles shows profile list
- [ ] Each profile shows name, description, inheritance
- [ ] Default profile marked with indicator
- [ ] Create button links to /profiles/new
- [ ] Edit button links to /profiles/:name
- [ ] Delete shows confirmation dialog
- [ ] Empty state shown when no profiles
- [ ] Loading state during fetch
- [ ] Error state with retry on failure

---

### Thrust 2: Profile Editor

**New Files:**
- `src/pages/ProfileDetail.tsx`
- `src/components/profiles/ProfileForm.tsx`
- `src/components/profiles/JsonConfigEditor.tsx`
- `src/components/profiles/ResolvedConfigPreview.tsx`

**Acceptance Criteria:**
- [ ] Create form at /profiles/new works
- [ ] Edit form at /profiles/:name loads existing data
- [ ] Name field validates (alphanumeric + dashes)
- [ ] Name disabled in edit mode
- [ ] Extends dropdown shows all profiles
- [ ] Cannot select self as parent
- [ ] JSON editor validates syntax
- [ ] Schema validation on submit
- [ ] Resolved config preview fetches and displays
- [ ] Cancel returns to list
- [ ] Unsaved changes warning on navigation

---

### Thrust 3: Profile API Integration

**New Files:**
- `src/api/profiles.ts`
- `src/hooks/useProfiles.ts`

**Acceptance Criteria:**
- [ ] useProfiles fetches profile list
- [ ] useProfile fetches single profile
- [ ] useCreateProfile mutation works
- [ ] useUpdateProfile mutation works
- [ ] useDeleteProfile mutation works
- [ ] Cache invalidation on mutations
- [ ] Optimistic updates for delete
- [ ] Error handling with toast notifications

---

## Phase 2: Audit & Observability

### Thrust 4: Audit Trail Viewer

**New Files:**
- `src/api/audit.ts`
- `src/hooks/useAudit.ts`
- `src/components/audit/AuditSection.tsx`
- `src/components/audit/AuditTimeline.tsx`
- `src/components/audit/AuditTimelineEntry.tsx`
- `src/components/audit/SnapshotViewer.tsx`
- `src/components/audit/ConfigDiff.tsx`

**Modified Files:**
- `src/pages/WorkOrderDetail.tsx` (add audit section)
- `src/pages/RunDetail.tsx` (add config snapshot)

**Acceptance Criteria:**
- [ ] Audit section appears on WorkOrderDetail
- [ ] Timeline shows all configuration snapshots
- [ ] Each entry shows run, timestamp, profile
- [ ] View Config opens modal with full config
- [ ] Compare shows diff between snapshots
- [ ] RunDetail shows config used for that run
- [ ] Config tree is collapsible
- [ ] Copy JSON button works

---

### Thrust 5: Health Dashboard

**New Files:**
- `src/pages/Health.tsx`
- `src/api/health.ts`
- `src/hooks/useHealth.ts`
- `src/components/health/HealthOverview.tsx`
- `src/components/health/StatusCard.tsx`
- `src/components/health/DriverStatusCard.tsx`
- `src/components/health/LimitsGauge.tsx`
- `src/components/health/SandboxStatus.tsx`

**Modified Files:**
- `src/App.tsx` (add route)
- `src/components/layout/Sidebar.tsx` (add nav item)

**Acceptance Criteria:**
- [ ] Health page accessible at /health
- [ ] Shows overall status (healthy/degraded/unhealthy)
- [ ] Shows server version
- [ ] Shows uptime (formatted)
- [ ] Capacity gauge shows current/max work orders
- [ ] All drivers listed with status
- [ ] Sandbox status shown
- [ ] Auto-refresh every 30 seconds
- [ ] Manual refresh button works
- [ ] Alert banner for degraded/unhealthy

---

### Thrust 6: Enhanced Error Display

**New Files:**
- `src/components/runs/ErrorDetail.tsx`
- `src/components/runs/OutputViewer.tsx`
- `src/components/runs/FullOutputModal.tsx`

**Modified Files:**
- `src/components/streaming/ErrorsTab.tsx`
- `src/components/runs/IterationCard.tsx`

**Acceptance Criteria:**
- [ ] Error type icon displayed
- [ ] Error message prominent
- [ ] Exit code shown when present
- [ ] Stdout section collapsible
- [ ] Stderr section collapsible
- [ ] Line numbers in output
- [ ] Copy button works
- [ ] View full output opens modal
- [ ] Dark mode styling correct

---

## Phase 3: Run Control & UX

### Thrust 7: Run Trigger

**New Files:**
- `src/components/runs/TriggerRunButton.tsx`
- `src/components/runs/TriggerRunDialog.tsx`
- `src/hooks/useTriggerRun.ts`

**Modified Files:**
- `src/pages/WorkOrderDetail.tsx` (add button)
- `src/api/runs.ts` (add trigger endpoint)

**Acceptance Criteria:**
- [ ] Button visible on failed work orders
- [ ] Button hidden on succeeded work orders
- [ ] Button disabled when run active
- [ ] Confirmation dialog opens
- [ ] Loading state during trigger
- [ ] Success navigates to new run
- [ ] Error displayed in dialog/toast
- [ ] Keyboard accessible

---

### Thrust 8: Advanced Filters

**New Files:**
- `src/hooks/useFilters.ts`
- `src/components/filters/AdvancedFilters.tsx`
- `src/components/filters/DateRangePicker.tsx`
- `src/components/filters/MultiSelect.tsx`
- `src/components/filters/SearchInput.tsx`
- `src/components/filters/FilterPill.tsx`

**Modified Files:**
- `src/pages/WorkOrders.tsx`
- `src/components/work-orders/WorkOrderFilters.tsx`

**Acceptance Criteria:**
- [ ] Status multi-select works
- [ ] Date range presets work
- [ ] Custom date range works
- [ ] Agent type filter works
- [ ] Repository search works
- [ ] Text search works
- [ ] Filters sync to URL
- [ ] URL loads correct filter state
- [ ] Clear all resets filters
- [ ] Active filter count shown
- [ ] Filter pills removable
- [ ] Mobile filter drawer

---

### Thrust 9: Iteration Deep Dive

**New Files:**
- `src/components/runs/IterationDetail.tsx`
- `src/components/runs/AgentOutputTab.tsx`
- `src/components/runs/ToolCallsTab.tsx`
- `src/components/runs/FilesTab.tsx`
- `src/components/runs/VerificationTab.tsx`
- `src/components/runs/ToolCallItem.tsx`
- `src/components/runs/FileChange.tsx`

**Modified Files:**
- `src/components/runs/IterationCard.tsx`
- `src/api/runs.ts` (iteration endpoints)

**Acceptance Criteria:**
- [ ] Iteration card expands to detail
- [ ] Tab navigation works
- [ ] Agent output displays with search
- [ ] Tool calls list with timing
- [ ] Tool call details expandable
- [ ] File changes with diffs
- [ ] Verification levels shown
- [ ] Prev/next navigation
- [ ] Copy and download work
- [ ] Lazy loading on expand

---

### Thrust 10: Responsive & Polish

**New Files:**
- `src/contexts/ThemeContext.tsx`
- `src/components/common/ThemeToggle.tsx`
- `src/components/common/SkipLink.tsx`
- `src/components/layout/MobileDrawer.tsx`

**Modified Files:**
- `tailwind.config.js` (dark mode)
- `src/main.tsx` (wrap with ThemeProvider)
- `src/App.tsx` (add SkipLink)
- `src/components/layout/Layout.tsx` (responsive)
- `src/components/layout/Sidebar.tsx` (mobile)
- `src/components/layout/Header.tsx` (mobile + theme toggle)
- ALL components (dark mode classes)

**Acceptance Criteria:**
- [ ] Theme toggle in header
- [ ] Light/dark/system options
- [ ] Preference persists
- [ ] Smooth theme transition
- [ ] Sidebar collapses on mobile
- [ ] Hamburger menu works
- [ ] Tables scroll horizontally
- [ ] Modals full-screen on mobile
- [ ] Touch targets 44px+
- [ ] Focus visible on all elements
- [ ] ARIA labels complete
- [ ] Skip link works
- [ ] Lighthouse a11y > 90

---

## Work Order Prompts

### Phase 1 Work Order

```
Implement Profile Management for AgentGate dashboard (v0.2.20 Phase 1, Thrusts 1-3).

Create complete profile CRUD functionality:

1. Profile List Page (/profiles)
   - Display all profiles with ProfileCard components
   - Show name, description, inheritance for each
   - Mark default profile with star indicator
   - Create/Edit/Delete buttons
   - Empty state when no profiles

2. Profile Editor (/profiles/:name and /profiles/new)
   - Form with name, description, extends dropdown, JSON config
   - Name validation (alphanumeric + dashes, 3-50 chars)
   - JSON syntax validation
   - Resolved config preview
   - Create and update modes

3. API Integration
   - Create src/api/profiles.ts with CRUD operations
   - Create src/hooks/useProfiles.ts with React Query hooks
   - Cache invalidation on mutations
   - Optimistic updates

Add routes to App.tsx and "Profiles" to Sidebar.

Reference: docs/DevGuides/DevGuide_v0.2.20/
Files 02-profile-list.md, 03-profile-editor.md, 04-profile-api.md

All components must support dark mode (use dark: variant classes).
```

### Phase 2 Work Order

```
Implement Audit & Observability for AgentGate dashboard (v0.2.20 Phase 2, Thrusts 4-6).

1. Audit Trail Viewer (Thrust 4)
   - Add AuditSection to WorkOrderDetail page
   - Timeline showing config snapshots per run
   - Modal to view full config JSON
   - Diff view comparing snapshots
   - Show config snapshot on RunDetail page

2. Health Dashboard (Thrust 5)
   - Create /health page
   - Overall status card (healthy/degraded/unhealthy)
   - Version and uptime display
   - Capacity gauge (active/max work orders)
   - Driver status cards
   - Sandbox status
   - Auto-refresh every 30 seconds

3. Enhanced Error Display (Thrust 6)
   - Use BuildError structure from v0.2.19
   - Error type with icon
   - Collapsible stdout/stderr sections
   - Line numbers
   - Copy and view full output buttons

Reference: docs/DevGuides/DevGuide_v0.2.20/
Files 05-audit-viewer.md, 06-health-dashboard.md, 07-enhanced-errors.md
```

### Phase 3 Work Order

```
Implement Run Control & UX for AgentGate dashboard (v0.2.20 Phase 3, Thrusts 7-10).

1. Run Trigger (Thrust 7)
   - Add TriggerRunButton to WorkOrderDetail
   - Confirmation dialog
   - POST /api/v1/work-orders/:id/runs
   - Navigate to new run on success

2. Advanced Filters (Thrust 8)
   - Multi-select status filter
   - Date range with presets
   - Repository search
   - Agent type filter
   - Sync filters to URL params
   - Clear all button
   - Mobile filter drawer

3. Iteration Deep Dive (Thrust 9)
   - Expand iteration card to full detail
   - Tabs: Output, Tool Calls, Files, Verification
   - Search within output
   - Tool call timing and details
   - File diffs
   - Prev/next navigation

4. Responsive & Polish (Thrust 10)
   - Dark mode with ThemeContext
   - Theme toggle in header
   - Mobile sidebar (hamburger menu)
   - Full-screen modals on mobile
   - Accessibility: focus, ARIA, skip link
   - All components dark mode ready

Reference: docs/DevGuides/DevGuide_v0.2.20/
Files 08-run-trigger.md through 11-polish.md
```

---

## Verification Checklist

### Phase 1 Complete
- [ ] /profiles page loads and shows profiles
- [ ] Can create new profile
- [ ] Can edit existing profile
- [ ] Can delete non-default profile
- [ ] Cannot delete default profile
- [ ] Inheritance tree displays correctly
- [ ] All tests pass
- [ ] No TypeScript errors

### Phase 2 Complete
- [ ] Audit timeline shows on WorkOrderDetail
- [ ] Config snapshot shows on RunDetail
- [ ] /health page loads with all sections
- [ ] Auto-refresh works
- [ ] Enhanced errors display correctly
- [ ] All tests pass
- [ ] No TypeScript errors

### Phase 3 Complete
- [ ] Run trigger button works
- [ ] All filters work and sync to URL
- [ ] Iteration detail expands with all tabs
- [ ] Dark mode toggles correctly
- [ ] Mobile layout works
- [ ] Lighthouse accessibility > 90
- [ ] All tests pass
- [ ] No TypeScript errors

---

## Rollback Plan

If issues arise:
1. Each phase is independently deployable
2. Feature flags can disable new routes
3. API changes are backward compatible
4. Database migrations (if any) have down migrations
