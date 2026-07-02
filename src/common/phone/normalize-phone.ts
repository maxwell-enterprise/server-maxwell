/** PostgreSQL pattern: strip non-digits (POSIX regex — `\\D` is not valid in PG). */
const PG_STRIP_NON_DIGITS = `'[^0-9]'`;

/**
 * Normalize phone numbers for deduplication (Indonesia-focused).
 * Strips non-digits, converts leading 0/8 to country code 62.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let clean = raw.replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('62')) {
    return clean;
  }
  if (clean.startsWith('0')) {
    clean = `62${clean.slice(1)}`;
  } else if (clean.startsWith('8')) {
    clean = `62${clean}`;
  }
  return clean;
}

/** SQL expression matching {@link normalizePhone} for a phone column (default alias `m`). */
export function phoneNormalizeSql(alias = 'm'): string {
  const phone = `coalesce(${alias}.phone, '')`;
  const digits = `regexp_replace(${phone}, ${PG_STRIP_NON_DIGITS}, '', 'g')`;
  return `
  case
    when ${digits} ~ '^62'
      then ${digits}
    when ${digits} ~ '^0.+'
      then '62' || substring(${digits} from 2)
    when ${digits} ~ '^8'
      then '62' || ${digits}
    else ${digits}
  end
`;
}

/** @deprecated Use {@link phoneNormalizeSql}('m') */
export const MEMBER_PHONE_NORMALIZE_SQL = phoneNormalizeSql('m');

/** Workspace `User.phone` with legacy abacContext.selfProfile.phone fallback. */
export function workspaceUserPhoneSql(alias = 'u'): string {
  const column = `nullif(btrim(coalesce(${alias}.phone, '')), '')`;
  const legacy = `nullif(btrim(${alias}."abacContext" #>> '{selfProfile,phone}'), '')`;
  return `coalesce(${column}, ${legacy}, '')`;
}

/** Workspace user phone (column + abac fallback) normalized for lookup. */
export function workspaceUserPhoneNormalizeSql(alias = 'u'): string {
  const raw = workspaceUserPhoneSql(alias);
  const digits = `regexp_replace(${raw}, ${PG_STRIP_NON_DIGITS}, '', 'g')`;
  return `
  case
    when ${digits} ~ '^62'
      then ${digits}
    when ${digits} ~ '^0.+'
      then '62' || substring(${digits} from 2)
    when ${digits} ~ '^8'
      then '62' || ${digits}
    else ${digits}
  end
`;
}