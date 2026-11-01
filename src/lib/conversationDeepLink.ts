const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function conversationHref(id: string): string | null {
  const value = id.trim();
  return UUID.test(value) ? `/conversation/${value}` : null;
}
