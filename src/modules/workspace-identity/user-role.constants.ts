/**
 * Mirrors maxwell-refactor `UserRole` string values (JWT / Prisma `User.appRole`).
 * Taksonomi produk (lifecycle + SoD): lihat `role-taxonomy.ts` — jangan ubah string
 * tanpa migrasi DB + FE.
 */
export const USER_ROLE = {
  SUPER_ADMIN: 'Super Admin',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  MARKETING: 'Marketing',
  SALES: 'Sales',
  FACILITATOR: 'Facilitator',
  GATE_KEEPER: 'Gate Keeper',
  MEMBER: 'Member',
  GUEST: 'Guest',
} as const;

export type UserRoleString = (typeof USER_ROLE)[keyof typeof USER_ROLE];

const ALL = new Set<string>(Object.values(USER_ROLE));
const MAX_ASSIGNED_ROLES = 2;

/** Normalize for fuzzy match: casing, underscores, extra spaces. */
function normalizeRoleKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Maps Prisma `User.appRole` / JWT role to canonical `USER_ROLE` strings.
 * Handles DB drift: wrong case, underscores, extra spaces, short aliases.
 */
export function parseAppRoleString(
  value: string | null | undefined,
): UserRoleString {
  const list = parseAppRoleList(value);
  if (list.length > 0) return list[0];

  const v = (value ?? '').trim();

  const key = normalizeRoleKey(v);
  for (const canonical of Object.values(USER_ROLE)) {
    if (normalizeRoleKey(canonical) === key) {
      return canonical;
    }
  }

  // Short / legacy aliases sometimes stored in older rows or imports
  if (key === 'admin' || key === 'superadmin' || key === 'super admin') {
    return USER_ROLE.SUPER_ADMIN;
  }
  if (key === 'gatekeeper' || key === 'gate keeper') {
    return USER_ROLE.GATE_KEEPER;
  }

  return USER_ROLE.MEMBER;
}

function parseLooseRoleToken(value: string): UserRoleString | null {
  const v = value.trim();
  if (!v) return null;
  if (ALL.has(v)) return v as UserRoleString;

  const key = normalizeRoleKey(v);
  for (const canonical of Object.values(USER_ROLE)) {
    if (normalizeRoleKey(canonical) === key) {
      return canonical;
    }
  }

  if (key === 'admin' || key === 'superadmin' || key === 'super admin') {
    return USER_ROLE.SUPER_ADMIN;
  }
  if (key === 'gatekeeper' || key === 'gate keeper') {
    return USER_ROLE.GATE_KEEPER;
  }
  return null;
}

export function parseAppRoleList(
  value: string | null | undefined,
): UserRoleString[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [USER_ROLE.MEMBER];

  const unique = new Set<UserRoleString>();
  const push = (token: string) => {
    const parsed = parseLooseRoleToken(token);
    if (parsed) unique.add(parsed);
  };

  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsedJson = JSON.parse(raw);
      if (Array.isArray(parsedJson)) {
        for (const item of parsedJson) {
          if (typeof item === 'string') push(item);
        }
      }
    } catch {
      /* fall through to delimiter parsing */
    }
  }

  if (unique.size === 0) {
    raw.split(/[,\n;|]+/).forEach(push);
  }

  if (unique.size === 0) {
    const single = parseLooseRoleToken(raw);
    return [single ?? USER_ROLE.MEMBER];
  }

  return Array.from(unique).slice(0, MAX_ASSIGNED_ROLES);
}

export function serializeAppRoleList(
  values: readonly string[],
): string {
  const unique = new Set<UserRoleString>();
  for (const value of values) {
    const parsed = parseLooseRoleToken(String(value ?? ''));
    if (parsed) unique.add(parsed);
  }
  const normalized = Array.from(unique).slice(0, MAX_ASSIGNED_ROLES);
  return (normalized.length > 0 ? normalized : [USER_ROLE.MEMBER]).join(', ');
}

export function hasAssignedRole(
  value: string | null | undefined,
  role: UserRoleString,
): boolean {
  return parseAppRoleList(value).includes(role);
}

export function assertAssignableRole(value: string): UserRoleString {
  const parsed = parseLooseRoleToken(value);
  if (!parsed) {
    throw new Error(`Invalid role: ${value}`);
  }
  return parsed;
}

export function assertAssignableRoleList(values: readonly string[]): UserRoleString[] {
  const normalized = Array.from(
    new Set(values.map((value) => assertAssignableRole(String(value ?? '')))),
  );
  if (normalized.length === 0) {
    return [USER_ROLE.MEMBER];
  }
  if (normalized.length > MAX_ASSIGNED_ROLES) {
    throw new Error(`A user can have at most ${MAX_ASSIGNED_ROLES} roles`);
  }
  return normalized;
}
