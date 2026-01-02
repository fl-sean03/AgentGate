#!/usr/bin/env tsx
/**
 * Generate OpenAPI specification files
 *
 * This script generates static OpenAPI spec files (JSON and YAML) from the
 * Fastify server configuration. Run with:
 *
 *   pnpm openapi:generate
 *
 * v0.2.17 - Thrust 5
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { createApp } from '../src/server/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  console.log('Generating OpenAPI specification...');

  // Create app instance (without starting server)
  const app = await createApp({
    apiKey: 'test-key-for-spec-generation',
    enableLogging: false,
  });

  // Wait for app to be ready (required for swagger to be available)
  await app.ready();

  // Get the OpenAPI spec
  const spec = app.swagger() as Record<string, unknown>;

  // Ensure output directory exists
  const outputDir = join(__dirname, '../../docs/api');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate JSON spec
  const jsonPath = join(outputDir, 'openapi.json');
  const jsonContent = JSON.stringify(spec, null, 2);
  writeFileSync(jsonPath, jsonContent);
  console.log(`  Written: ${jsonPath}`);

  // Generate YAML spec
  const yamlPath = join(outputDir, 'openapi.yaml');
  const yamlContent = YAML.stringify(spec);
  writeFileSync(yamlPath, yamlContent);
  console.log(`  Written: ${yamlPath}`);

  // Close app
  await app.close();

  console.log('OpenAPI specification generated successfully!');
  console.log(`\nSwagger UI available at: http://localhost:3000/docs`);
}

main().catch((error) => {
  console.error('Failed to generate OpenAPI spec:', error);
  process.exit(1);
});
