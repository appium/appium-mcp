import {z} from 'zod';

export const elementUUIDScheme = z
  .string()
  .describe('The uuid of the element returned by appium_find_element to click');
