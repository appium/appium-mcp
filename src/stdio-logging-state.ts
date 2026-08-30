let stdioLoggingConfigured = false;

export function isStdioTransportLoggingConfigured(): boolean {
  return stdioLoggingConfigured;
}

export function markStdioTransportLoggingConfigured(): void {
  stdioLoggingConfigured = true;
}
