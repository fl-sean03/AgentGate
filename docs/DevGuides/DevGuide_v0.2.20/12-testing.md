# 12: Testing Strategy

## Overview

This document defines the testing strategy for v0.2.20 Dashboard Enhancement, covering unit tests, integration tests, end-to-end tests, and accessibility audits.

---

## Testing Stack

| Tool | Purpose |
|------|---------|
| Vitest | Unit and integration test runner |
| React Testing Library | Component testing |
| MSW (Mock Service Worker) | API mocking |
| Playwright | End-to-end testing |
| axe-core | Accessibility testing |
| Lighthouse | Performance and a11y audits |

---

## Test Categories

### Unit Tests

Test individual components and functions in isolation.

**Coverage Target:** 80%+

**What to Test:**
- Component rendering
- Props handling
- Event handlers
- State changes
- Utility functions
- Hooks logic

**What NOT to Test:**
- Third-party library internals
- CSS styling (use visual regression)
- Implementation details

### Integration Tests

Test component interactions and API integration.

**Coverage Target:** Key user flows

**What to Test:**
- Form submission flows
- Navigation between pages
- API request/response handling
- Cache behavior
- Error handling

### End-to-End Tests

Test complete user journeys through the application.

**Coverage Target:** Critical paths

**What to Test:**
- Profile CRUD flow
- Work order creation and monitoring
- Filter and search functionality
- Theme switching
- Mobile navigation

### Accessibility Tests

Ensure WCAG AA compliance.

**What to Test:**
- Keyboard navigation
- Screen reader compatibility
- Color contrast
- Focus management
- ARIA attributes

---

## Test File Structure

```
packages/dashboard/
├── src/
│   ├── components/
│   │   └── profiles/
│   │       ├── ProfileCard.tsx
│   │       └── __tests__/
│   │           └── ProfileCard.test.tsx
│   ├── hooks/
│   │   └── __tests__/
│   │       └── useProfiles.test.tsx
│   └── pages/
│       └── __tests__/
│           └── Profiles.test.tsx
├── tests/
│   ├── integration/
│   │   └── profiles.test.tsx
│   ├── e2e/
│   │   └── profiles.spec.ts
│   └── setup/
│       ├── test-utils.tsx
│       └── mocks/
│           └── handlers.ts
```

---

## Unit Test Examples

### Component Test

```
File: ProfileCard.test.tsx

Test Cases:
1. renders profile name
   - Input: profile with name "default"
   - Expected: text "default" visible

2. renders description
   - Input: profile with description "Base config"
   - Expected: text "Base config" visible

3. renders inheritance info
   - Input: profile with extends "base"
   - Expected: text "Inherits: base" visible

4. shows default indicator for default profile
   - Input: profile marked as default
   - Expected: star icon visible

5. calls onEdit when edit button clicked
   - Input: mock onEdit handler
   - Action: click edit button
   - Expected: onEdit called with profile

6. calls onDelete when delete button clicked
   - Input: mock onDelete handler
   - Action: click delete button
   - Expected: onDelete called with profile.name

7. disables delete for default profile
   - Input: profile marked as default
   - Expected: delete button disabled
```

### Hook Test

```
File: useProfiles.test.tsx

Test Cases:
1. returns loading state initially
   - Expected: isLoading true, data undefined

2. returns data on success
   - Mock: successful API response
   - Expected: isLoading false, data populated

3. returns error on failure
   - Mock: API error
   - Expected: isLoading false, error populated

4. refetches on window focus
   - Action: trigger window focus
   - Expected: API called again

5. uses cache for subsequent calls
   - Action: call hook twice quickly
   - Expected: only one API call
```

---

## Integration Test Examples

### Profile CRUD Flow

```
File: profiles.test.tsx

Test Cases:
1. creates new profile
   - Navigate to /profiles/new
   - Fill in name, description
   - Select parent profile
   - Enter JSON config
   - Submit form
   - Verify: redirect to /profiles
   - Verify: new profile in list

2. edits existing profile
   - Navigate to /profiles/test-profile
   - Modify description
   - Modify config
   - Submit form
   - Verify: changes persisted

3. deletes profile
   - Navigate to /profiles
   - Click delete on profile card
   - Confirm in dialog
   - Verify: profile removed from list

4. validates profile form
   - Navigate to /profiles/new
   - Submit empty form
   - Verify: validation errors shown
   - Fill required fields
   - Submit again
   - Verify: success
```

### Filter Integration

```
File: filters.test.tsx

Test Cases:
1. filters by status
   - Set status filter to "running"
   - Verify: API called with status param
   - Verify: only running work orders shown

2. filters by date range
   - Set date range to "last 7 days"
   - Verify: API called with date params
   - Verify: URL updated

3. combines multiple filters
   - Set status, date, and search
   - Verify: all params in API call
   - Verify: URL has all params

4. clears all filters
   - Apply multiple filters
   - Click "Clear All"
   - Verify: all filters reset
   - Verify: URL cleared
```

---

## E2E Test Examples

### Profile Management E2E

```
File: profiles.spec.ts

Scenario: Complete profile lifecycle
  1. Navigate to profiles page
  2. Verify empty state or existing profiles
  3. Click "Create Profile"
  4. Fill form with test data
  5. Submit and verify redirect
  6. Find new profile in list
  7. Click edit on profile
  8. Modify and save
  9. Verify changes
  10. Delete profile
  11. Verify removal
```

### Mobile Navigation E2E

```
File: mobile.spec.ts

Scenario: Mobile navigation
  1. Set viewport to 375x667
  2. Verify sidebar hidden
  3. Click hamburger menu
  4. Verify drawer opens
  5. Navigate to Work Orders
  6. Verify drawer closes
  7. Verify correct page loads
```

---

## Mock Setup

### MSW Handlers

```
File: handlers.ts

Handlers:
1. GET /api/v1/profiles
   - Returns mock profile list

2. GET /api/v1/profiles/:name
   - Returns specific mock profile
   - Returns 404 for "nonexistent"

3. POST /api/v1/profiles
   - Returns created profile
   - Returns 409 for duplicate name

4. PUT /api/v1/profiles/:name
   - Returns updated profile
   - Returns 404 for nonexistent

5. DELETE /api/v1/profiles/:name
   - Returns success
   - Returns 403 for "default"

6. GET /health
   - Returns mock health status

7. GET /api/v1/work-orders
   - Supports query params
   - Returns filtered results
```

---

## Accessibility Testing

### Automated Tests

```
File: accessibility.test.tsx

For each page:
1. Run axe-core analysis
2. Verify no violations at "critical" or "serious" levels
3. Log warnings for review

Test Cases:
- /dashboard passes a11y audit
- /work-orders passes a11y audit
- /profiles passes a11y audit
- /profiles/new (form) passes a11y audit
- /health passes a11y audit
```

### Manual Testing Checklist

| Test | Method |
|------|--------|
| Keyboard-only navigation | Tab through entire app |
| Screen reader | Test with VoiceOver/NVDA |
| High contrast mode | Enable OS high contrast |
| Zoom to 200% | Verify layout still works |
| Color blindness | Use simulation tools |

---

## Performance Testing

### Lighthouse Audits

**Targets:**
- Performance: > 90
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 80

### Bundle Size Monitoring

**Targets:**
- Initial JS: < 200KB gzipped
- Total JS: < 500KB gzipped
- No chunk > 100KB

### Performance Metrics

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3.5s |
| Total Blocking Time | < 200ms |
| Cumulative Layout Shift | < 0.1 |

---

## Test Coverage Requirements

### Per-Thrust Coverage

| Thrust | Unit | Integration | E2E |
|--------|------|-------------|-----|
| 1. Profile List | 80% | 1 flow | 1 scenario |
| 2. Profile Editor | 80% | 1 flow | Included above |
| 3. Profile API | 90% | 1 flow | Included above |
| 4. Audit Viewer | 80% | 1 flow | 1 scenario |
| 5. Health Dashboard | 80% | 1 flow | 1 scenario |
| 6. Enhanced Errors | 80% | 1 flow | - |
| 7. Run Trigger | 80% | 1 flow | 1 scenario |
| 8. Advanced Filters | 80% | 2 flows | 1 scenario |
| 9. Iteration Detail | 80% | 1 flow | - |
| 10. Polish | 70% | 1 flow | 2 scenarios |

---

## CI/CD Integration

### Test Pipeline

```
1. Lint (ESLint)
2. Type Check (tsc)
3. Unit Tests (Vitest)
4. Integration Tests (Vitest + MSW)
5. Build
6. E2E Tests (Playwright)
7. Accessibility Audit (axe)
8. Lighthouse Audit
9. Deploy (if all pass)
```

### Test Commands

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run accessibility audit
pnpm test:a11y

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch
```

---

## Test Data

### Mock Profiles

```
- default: Base profile, no parent
- fast-iteration: Extends default, fewer iterations
- thorough-review: Extends default, all verification
- ci-optimized: Extends fast-iteration
```

### Mock Work Orders

```
- Running work order
- Succeeded work order
- Failed work order (with errors)
- Queued work order
```

### Mock Health Data

```
- Healthy state
- Degraded state (one driver down)
- Unhealthy state
```
