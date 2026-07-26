import log from '../logger.js';
import {isUIEnabled} from '../ui/mcp-apps.js';
// Export all resources
import javaTemplatesResource from './java/template.js';
import pageSourceInspectorResource from './page-source-inspector.js';

export default function registerResources(server: any) {
  javaTemplatesResource(server);
  if (isUIEnabled()) {
    pageSourceInspectorResource(server);
  }
  log.info('All resources registered');
}
