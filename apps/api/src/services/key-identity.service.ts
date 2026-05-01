export function buildFullKey(name: string, namespaceSlug?: string | null): string {
  return namespaceSlug ? `${namespaceSlug}.${name}` : name
}

export function serializeKeyRecord<
  T extends { name: string; namespaceId?: string | null; namespace?: { id?: string; slug: string } | null },
>(key: T) {
  const namespaceSlug = key.namespace?.slug ?? null
  return {
    ...key,
    namespaceId: key.namespaceId ?? key.namespace?.id ?? null,
    namespaceSlug,
    fullKey: buildFullKey(key.name, namespaceSlug),
  }
}
