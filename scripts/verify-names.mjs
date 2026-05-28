#!/usr/bin/env node
import {
  AppiumScreenshotPlugin,
  formatVerificationReport,
  verifyAppiumMcpNames,
} from '../dist/core.js';

const report = verifyAppiumMcpNames({
  plugins: [new AppiumScreenshotPlugin()],
});
const output = formatVerificationReport(report);
if (report.ok) {
  console.log(output);
  process.exit(0);
} else {
  console.log(output);
  process.exit(1);
}
