import log from '../logger.js';
import {isMcpAppsEnabled} from '../ui/mcp-apps.js';
// Export all resources
import javaTemplatesResource from './java/template.js';
import locatorGeneratorResource from './locator-generator.js';
import pageSourceInspectorResource from './page-source-inspector.js';
import screenshotViewerResource from './screenshot-viewer.js';

export default function registerResources(server: any) {
  javaTemplatesResource(server);
  if (isMcpAppsEnabled()) {
    pageSourceInspectorResource(server);
    screenshotViewerResource(server);
    locatorGeneratorResource(server);
  }
  log.info('All resources registered');
}
