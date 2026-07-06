export function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function testEmail(prefix: string) {
  return `${uniqueId(prefix)}@test.local`.toLowerCase();
}
