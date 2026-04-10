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
  const v = (value ?? '').trim();
  if (ALL.has(v)) return v as UserRoleString;

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

export function assertAssignableRole(value: string): UserRoleString {
  const v = value.trim();
  if (!ALL.has(v)) {
    throw new Error(`Invalid role: ${value}`);
  }
  return v as UserRoleString;
}
