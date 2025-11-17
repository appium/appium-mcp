// Export all resources
import javaTemplatesResource from './java/template.js';
import log from '../logger.js';

export default function registerResources(server: any) {
  javaTemplatesResource(server);
  log.info('All resources registered');
}
