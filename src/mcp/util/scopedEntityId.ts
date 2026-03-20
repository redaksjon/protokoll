/**
 * Client / list APIs sometimes surface composite ids (e.g. "default-server:<uuid>" or
 * "<profile-id>:<uuid>") while context storage keys entities by the bare UUID in YAML.
 * These helpers normalize ids for lookup and deduplication.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * If id is "anything:<uuid>" where the part after the first colon is a full UUID,
 * return that UUID; otherwise return the trimmed original string.
 */
export function resolveCanonicalEntityId(id: string): string {
    const t = id.trim();
    const colon = t.indexOf(':');
    if (colon === -1) {
        return t;
    }
    const rest = t.slice(colon + 1).trim();
    if (UUID_RE.test(rest)) {
        return rest;
    }
    return t;
}

/** Try raw id first, then canonical (stripped) form when they differ. */
export function entityIdLookupOrder(id: string): string[] {
    const t = id.trim();
    const canon = resolveCanonicalEntityId(t);
    return canon === t ? [t] : [t, canon];
}
