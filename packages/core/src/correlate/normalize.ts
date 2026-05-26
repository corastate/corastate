/**
 * Normalization helpers shared across the correlation engine. Ported from
 * an earlier Device Spotlight correlator: the algorithms that turn vendor
 * strings into stable comparison keys.
 *
 * The functions are pure so the engine can be exercised by unit tests
 * without a database.
 */

/**
 * Canonicalize a MAC address to colon-delimited uppercase form. Accepts the
 * delimiter styles vendors use (colon, hyphen, dot) and Cisco-flavoured
 * triplets (1234.5678.9abc). Returns null when the input does not parse to
 * 12 hex digits — the engine treats that as "no MAC observed" rather than
 * silently emitting garbage.
 */
export function normalizeMac(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[-.:]/g, '');
  if (cleaned.length !== 12 || /[^0-9A-F]/.test(cleaned)) return null;
  return cleaned.match(/.{2}/g)!.join(':');
}

/**
 * Canonicalize a hostname for cross-source matching. The rules are the
 * upstream correlator's:
 *
 *   - strip a leading `DOMAIN\` prefix (Windows machine-domain reporting)
 *   - drop the FQDN suffix if any (a.example.com → A)
 *   - upper-case, replace whitespace and underscores with hyphens
 *   - collapse runs of hyphens, then strip leading/trailing hyphens
 *
 * IP-looking strings short-circuit the FQDN drop so `10.0.0.1` doesn't get
 * mangled into `10`.
 */
export function normalizeHostname(hostname: string | null | undefined): string {
  if (!hostname) return '';
  let h = String(hostname).trim();
  if (h.includes('\\')) {
    const parts = h.split('\\');
    h = parts[parts.length - 1] ?? '';
  }
  if (h.includes('.') && !h.replace(/\./g, '').match(/^\d+$/)) {
    h = h.split('.')[0] ?? '';
  }
  h = h.replace(/['’]/g, '');
  h = h.toUpperCase().trim().replace(/\s+/g, '-').replace(/_/g, '-');
  while (h.includes('--')) h = h.replace(/--/g, '-');
  return h.replace(/^-+|-+$/g, '');
}

/**
 * Normalize a serial number for matching. Vendors disagree on case and
 * trailing whitespace; we standardise on upper + trim and drop empty
 * strings to null so the engine can branch on truthiness alone.
 */
export function normalizeSerial(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Synthetic keys identify groups that have no real serial — devices the
 * engine could not back to a hardware id. They sort to the back of the
 * merge order so a synthetic group can absorb into a real-serial group but
 * never vice versa (A1: never merge two real-serial groups).
 */
export function isSyntheticKey(key: string): boolean {
  return key.startsWith('HOSTNAME-') || key.startsWith('IP-') || key.startsWith('UNKNOWN-');
}

/**
 * True when `serial` appears in `hostname` at a word boundary (delimited by
 * `-` or the start/end of the string). The boundary check prevents a serial
 * that happens to be a substring of an unrelated hostname from forcing a
 * merge, e.g. avoiding the false positive that `C02XY12345AB` matches
 * `XYZ-C02XY12345ABCDE-2`.
 *
 * Minimum-length gating happens at the caller (8 chars per the upstream
 * algorithm) so this stays a pure regex utility.
 */
export function serialAtBoundary(serial: string, hostname: string): boolean {
  if (!serial || !hostname) return false;
  const escaped = serial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|-)${escaped}(?:-|$)`);
  return pattern.test(hostname);
}

/**
 * Build the synthetic key for a no-serial device. Prefers hostname so two
 * devices with the same hostname (but different vendor ids) collapse; falls
 * back to source + entity id when even hostname is missing.
 */
export function syntheticKey(input: {
  hostname: string | null;
  source: string;
  entityId: string;
}): string {
  const hn = normalizeHostname(input.hostname);
  if (hn) return `HOSTNAME-${hn}`;
  return `UNKNOWN-${input.source}-${input.entityId}`;
}

/**
 * Apply the lowercase / trim / lowercase+trim normalization the config
 * lists per match key. The engine consults this when comparing two values
 * for a configured match field.
 */
export function applyNormalization(
  value: string | null,
  mode: 'none' | 'lowercase' | 'trim' | 'lowercase+trim',
): string | null {
  if (value === null) return null;
  switch (mode) {
    case 'lowercase':
      return value.toLowerCase();
    case 'trim':
      return value.trim();
    case 'lowercase+trim':
      return value.trim().toLowerCase();
    case 'none':
    default:
      return value;
  }
}
