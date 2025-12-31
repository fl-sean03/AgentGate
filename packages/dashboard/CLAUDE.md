# agentgate-dashboard

## Goal

Create a new React dashboard project for AgentGate.

REQUIREMENTS:
1. Initialize Vite + React + TypeScript project
2. Configure TailwindCSS with custom theme
3. Add dependencies:
   - @tanstack/react-query
   - react-router-dom
   - lucide-react
   - zod

4. Set up project structure:
   - src/main.tsx - entry with QueryClient and Router providers
   - src/App.tsx - main app with router
   - src/components/ - component directory
   - src/hooks/ - custom hooks
   - src/api/ - API client
   - src/types/ - TypeScript types
   - src/pages/ - page components

5. Configure ESLint and Prettier for React/TypeScript

6. Create verify.yaml for AgentGate verification:
   version: '1'
   name: 'agentgate-dashboard'
   environment:
     runtime: node
     version: '20'
     setup:
       - pnpm install
   tests:
     - name: typecheck
       command: pnpm typecheck
     - name: lint
       command: pnpm lint
     - name: build
       command: pnpm build
   contracts:
     required_files: []
     forbidden_patterns: []
   policy:
     network: false
     max_runtime: 300

7. Create README.md with setup instructions

VERIFICATION:
- pnpm install succeeds
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 4 for complete details.

## Guidelines

- Write clean, maintainable code with clear naming
- Include appropriate error handling
- Add comments for complex logic
- Follow existing code patterns in the project
- Ensure all changes are properly tested