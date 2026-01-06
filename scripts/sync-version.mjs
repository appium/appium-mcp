#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const serverJson = JSON.parse(readFileSync('server.json', 'utf8'));

const version = packageJson.version;

// Update server.json version
serverJson.version = version;
serverJson.packages[0].version = version;

writeFileSync('server.json', JSON.stringify(serverJson, null, 2) + '\n');

console.log(`✓ Synced version to ${version}`);
