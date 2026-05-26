#!/usr/bin/env node
import { formatVerificationReport, verifyAppiumMcpNames } from '../dist/plugin.js';

const report = verifyAppiumMcpNames();
const output = formatVerificationReport(report);
if (report.ok) {
  console.log(output);
  process.exit(0);
} else {
  console.log(output);
  process.exit(1);
}
