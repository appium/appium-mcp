import log from '../logger.js';
// Export all resources
import javaTemplatesResource from './java/template.js';

export default function registerResources(server: any) {
  javaTemplatesResource(server);
  log.info('All resources registered');
}
