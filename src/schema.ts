import {z} from 'zod';

export const elementUUIDScheme = z.string().describe('Element ID from appium_find_element.');
