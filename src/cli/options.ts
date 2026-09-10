export const CLI_OPTIONS = {
  help: '--help',
  shortHelp: '-h',
  httpStream: '--httpStream',
  port: '--port',
  plugin: '--plugin',
} as const;

export const CLI_VALUE_PREFIXES = {
  port: `${CLI_OPTIONS.port}=`,
  plugin: `${CLI_OPTIONS.plugin}=`,
} as const;
