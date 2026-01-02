# 11: Thrust 10 - Responsive & Polish

## Objective

Implement dark mode support, responsive mobile layout, and accessibility improvements to provide a polished, professional user experience across all devices and user preferences.

---

## Requirements

### Dark Mode Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F10.1 | Toggle between light, dark, and system preference | Must Have |
| F10.2 | Persist theme preference in localStorage | Must Have |
| F10.3 | Apply dark mode via CSS class on document root | Must Have |
| F10.4 | All components support dark mode variants | Must Have |
| F10.5 | Smooth transition when switching themes | Should Have |
| F10.6 | Respect prefers-reduced-motion | Should Have |

### Responsive Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F10.7 | Sidebar collapses to hamburger on mobile | Must Have |
| F10.8 | Tables scroll horizontally on mobile | Must Have |
| F10.9 | Forms stack vertically on mobile | Must Have |
| F10.10 | Touch-friendly tap targets (min 44px) | Must Have |
| F10.11 | Modals become full-screen on mobile | Should Have |

### Accessibility Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F10.12 | Keyboard navigation for all interactive elements | Must Have |
| F10.13 | Visible focus indicators | Must Have |
| F10.14 | ARIA labels for icons and buttons | Must Have |
| F10.15 | Color contrast meets WCAG AA (4.5:1) | Must Have |
| F10.16 | Screen reader announcements for dynamic content | Should Have |
| F10.17 | Skip to main content link | Should Have |

---

## Dark Mode Implementation

### Theme Options

| Option | Behavior |
|--------|----------|
| Light | Always light theme |
| Dark | Always dark theme |
| System | Match OS preference |

### Theme Context Structure

```
ThemeContext
├── theme: 'light' | 'dark' | 'system'
├── effectiveTheme: 'light' | 'dark'
├── setTheme: (theme) => void
└── toggleTheme: () => void
```

### CSS Strategy

Using TailwindCSS class-based dark mode:

```
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  // ...
}
```

### Color Palette

**Light Mode:**

| Purpose | Color | Tailwind Class |
|---------|-------|----------------|
| Background | #ffffff | bg-white |
| Surface | #f9fafb | bg-gray-50 |
| Text Primary | #111827 | text-gray-900 |
| Text Secondary | #6b7280 | text-gray-500 |
| Border | #e5e7eb | border-gray-200 |
| Primary | #3b82f6 | text-blue-500 |
| Success | #10b981 | text-green-500 |
| Warning | #f59e0b | text-amber-500 |
| Error | #ef4444 | text-red-500 |

**Dark Mode:**

| Purpose | Color | Tailwind Class |
|---------|-------|----------------|
| Background | #111827 | dark:bg-gray-900 |
| Surface | #1f2937 | dark:bg-gray-800 |
| Text Primary | #f9fafb | dark:text-gray-50 |
| Text Secondary | #9ca3af | dark:text-gray-400 |
| Border | #374151 | dark:border-gray-700 |
| Primary | #60a5fa | dark:text-blue-400 |
| Success | #34d399 | dark:text-green-400 |
| Warning | #fbbf24 | dark:text-amber-400 |
| Error | #f87171 | dark:text-red-400 |

### Theme Toggle Component

**Location:** Header (desktop) and Settings page

```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                      [🌙] [User ▼]       │
└─────────────────────────────────────────────────────────────────┘

Toggle states:
  ☀️ Light mode active
  🌙 Dark mode active
  💻 System mode active
```

### Transition Effect

```
html {
  transition: background-color 0.2s ease, color 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  html {
    transition: none;
  }
}
```

---

## Responsive Design

### Breakpoints

| Name | Width | Use Case |
|------|-------|----------|
| Mobile | < 640px | Phone portrait |
| Tablet | 640px - 1023px | Phone landscape, tablet |
| Desktop | >= 1024px | Laptop, desktop |

### Layout Changes

**Desktop (1024px+):**
- Sidebar always visible (240px width)
- Content area uses remaining space
- Multi-column grids
- Inline filters

**Tablet (640px - 1023px):**
- Sidebar collapsed to icons (64px)
- Hover to expand sidebar
- Two-column grids
- Collapsible filter panel

**Mobile (< 640px):**
- Sidebar hidden (hamburger menu)
- Full-width content
- Single-column layout
- Bottom sheet for filters
- Full-screen modals

### Navigation Patterns

**Desktop Sidebar:**
```
┌───────┬────────────────────────────────────────────┐
│       │                                            │
│ Side  │           Main Content                     │
│ bar   │                                            │
│       │                                            │
└───────┴────────────────────────────────────────────┘
```

**Mobile with Hamburger:**
```
┌────────────────────────────────────────────────────┐
│ ☰ AgentGate                              [🌙] [👤] │
├────────────────────────────────────────────────────┤
│                                                    │
│              Main Content                          │
│                                                    │
└────────────────────────────────────────────────────┘

Hamburger opens drawer:
┌─────────────────────┐──────────────────────────────┐
│ ✕ Menu              │                              │
│                     │                              │
│ Dashboard           │        (dimmed)              │
│ Work Orders         │                              │
│ Runs                │                              │
│ Profiles            │                              │
│ Health              │                              │
│ Settings            │                              │
│                     │                              │
└─────────────────────┘──────────────────────────────┘
```

### Component-Specific Responsive Behavior

**Tables:**
- Desktop: Full table with all columns
- Mobile: Card list or horizontal scroll

**Forms:**
- Desktop: Multi-column layout possible
- Mobile: Single column, stacked fields

**Modals:**
- Desktop: Centered overlay with max-width
- Mobile: Full-screen with slide-up animation

**Cards:**
- Desktop: Grid layout (2-3 columns)
- Mobile: Stacked vertically

---

## Accessibility Implementation

### Focus Management

**Focus Indicators:**
```
:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

.dark :focus-visible {
  outline-color: #60a5fa;
}
```

**Focus Trap in Modals:**
- First focusable element receives focus on open
- Tab cycles within modal
- Escape closes modal
- Focus returns to trigger on close

### Keyboard Navigation

| Element | Key | Action |
|---------|-----|--------|
| Button | Enter, Space | Activate |
| Link | Enter | Navigate |
| Modal | Escape | Close |
| Dropdown | Arrow Up/Down | Navigate options |
| Dropdown | Enter | Select option |
| Dropdown | Escape | Close dropdown |
| Tab panel | Arrow Left/Right | Switch tabs |
| Sidebar | Arrow Up/Down | Navigate items |

### ARIA Attributes

**Buttons with icons only:**
```
<button aria-label="Toggle dark mode">
  <MoonIcon />
</button>
```

**Loading states:**
```
<button aria-busy="true" aria-disabled="true">
  <Spinner aria-hidden="true" />
  <span>Loading...</span>
</button>
```

**Dynamic regions:**
```
<div role="status" aria-live="polite">
  Work order created successfully
</div>
```

**Navigation:**
```
<nav aria-label="Main navigation">
  <a aria-current="page" href="/dashboard">Dashboard</a>
</nav>
```

### Color Contrast

All text must meet WCAG AA standards:
- Normal text: 4.5:1 contrast ratio
- Large text (18px+ or 14px+ bold): 3:1 contrast ratio
- Interactive elements: 3:1 contrast ratio

**Testing Tools:**
- Chrome DevTools Lighthouse
- axe browser extension
- WebAIM Contrast Checker

### Skip Links

```
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

...

<main id="main-content">
  ...
</main>
```

**Skip link styling:**
- Visually hidden by default
- Visible on focus
- High contrast background

---

## Animation Guidelines

### Transitions

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Hover state | 150ms | ease-out |
| Theme switch | 200ms | ease |
| Modal open | 200ms | ease-out |
| Modal close | 150ms | ease-in |
| Dropdown open | 150ms | ease-out |
| Sidebar collapse | 200ms | ease-in-out |

### Reduced Motion

```
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Component Updates

### Components Requiring Updates

| Component | Dark Mode | Responsive | A11y |
|-----------|-----------|------------|------|
| Layout | ✓ | ✓ | ✓ |
| Sidebar | ✓ | ✓ | ✓ |
| Header | ✓ | ✓ | ✓ |
| Modal | ✓ | ✓ | ✓ |
| Button | ✓ | - | ✓ |
| Card | ✓ | ✓ | - |
| Table | ✓ | ✓ | ✓ |
| Form fields | ✓ | ✓ | ✓ |
| Dropdown | ✓ | ✓ | ✓ |
| Badge | ✓ | - | ✓ |
| Spinner | ✓ | - | ✓ |
| Toast | ✓ | ✓ | ✓ |

---

## Testing Checklist

### Dark Mode Testing

- [ ] Toggle from light to dark
- [ ] Toggle from dark to light
- [ ] System preference detection
- [ ] Preference persists after refresh
- [ ] All pages render correctly in dark mode
- [ ] No white flashes on page load
- [ ] Transitions are smooth

### Responsive Testing

- [ ] Test at 375px (iPhone SE)
- [ ] Test at 390px (iPhone 14)
- [ ] Test at 768px (iPad)
- [ ] Test at 1024px (laptop)
- [ ] Test at 1440px (desktop)
- [ ] Sidebar collapses correctly
- [ ] Tables scroll horizontally
- [ ] Modals are full-screen on mobile
- [ ] Touch targets are 44px+

### Accessibility Testing

- [ ] Tab through all interactive elements
- [ ] All elements have visible focus
- [ ] Screen reader announces content
- [ ] Color contrast passes
- [ ] Keyboard shortcuts work
- [ ] Skip link works
- [ ] Modals trap focus
- [ ] ARIA labels are meaningful

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC10.1 | Theme toggle works | Click toggle |
| AC10.2 | System preference detected | Match OS |
| AC10.3 | Preference persists | Refresh page |
| AC10.4 | All components dark-mode ready | Visual check |
| AC10.5 | Sidebar collapses on mobile | Resize window |
| AC10.6 | Hamburger menu works | Click menu |
| AC10.7 | Tables scroll on mobile | Check tables |
| AC10.8 | Modals full-screen on mobile | Open modal |
| AC10.9 | Keyboard navigation works | Tab through |
| AC10.10 | Focus visible | Check focus ring |
| AC10.11 | Screen reader works | VoiceOver test |
| AC10.12 | Contrast passes | Lighthouse audit |
| AC10.13 | Touch targets adequate | Measure |
| AC10.14 | Reduced motion respected | Enable setting |
