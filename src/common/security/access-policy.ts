import { ForbiddenException } from '@nestjs/common';
import {
  parseAppRoleString,
  USER_ROLE,
  type UserRoleString,
} from '../../modules/workspace-identity/user-role.constants';
import type { JwtUserPayload } from '../../modules/auth/auth.service';

function readable(list: readonly string[]): string {
  return list.join(', ');
}

function hasCustomResourceAccess(
  user: JwtUserPayload,
  resourceIds: readonly string[],
): boolean {
  const customRoleId = String(user?.customRoleId ?? '').trim();
  if (!customRoleId) return false;
  const allowed = Array.isArray(user?.customAllowedFeatures)
    ? user.customAllowedFeatures
        .map((value) => String(value ?? '').trim())
        .filter((value) => !!value)
    : [];
  return resourceIds.some((resourceId) => allowed.includes(resourceId));
}

function assertRoleOrCustomResource(
  user: JwtUserPayload,
  allowedRoles: readonly UserRoleString[],
  resourceIds: readonly string[],
  actionLabel: string,
): void {
  const role = parseAppRoleString(user?.role);
  if (allowedRoles.includes(role)) {
    return;
  }
  if (resourceIds.length > 0 && hasCustomResourceAccess(user, resourceIds)) {
    return;
  }
  throw new ForbiddenException(
    `${actionLabel} requires role: ${readable(allowedRoles)}`,
  );
}

export function assertRole(
  user: JwtUserPayload,
  allowedRoles: readonly UserRoleString[],
  actionLabel: string,
): void {
  const role = parseAppRoleString(user?.role);
  if (!allowedRoles.includes(role)) {
    throw new ForbiddenException(
      `${actionLabel} requires role: ${readable(allowedRoles)}`,
    );
  }
}

export function assertSuperAdminOnly(
  user: JwtUserPayload,
  actionLabel = 'System administration',
): void {
  assertRole(user, [USER_ROLE.SUPER_ADMIN], actionLabel);
}

export function assertFinanceControllerOnly(
  user: JwtUserPayload,
  actionLabel = 'Financial operation',
): void {
  // Super Admin keeps full-system override, Finance remains day-to-day owner.
  assertRole(user, [USER_ROLE.FINANCE, USER_ROLE.SUPER_ADMIN], actionLabel);
}

/** Any authenticated workspace staff role; excludes Member / Guest consumer personas. */
export function assertWorkspaceStaffOnly(
  user: JwtUserPayload,
  actionLabel = 'Workspace staff operation',
): void {
  assertRole(
    user,
    [
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.FINANCE,
      USER_ROLE.OPERATIONS,
      USER_ROLE.MARKETING,
      USER_ROLE.SALES,
      USER_ROLE.FACILITATOR,
      USER_ROLE.GATE_KEEPER,
    ],
    actionLabel,
  );
}

/** Ops-owned surfaces; Super Admin break-glass override. */
export function assertOperationsOnly(
  user: JwtUserPayload,
  actionLabel = 'Operational configuration',
): void {
  assertRole(
    user,
    [USER_ROLE.OPERATIONS, USER_ROLE.SUPER_ADMIN],
    actionLabel,
  );
}

/** Event / ops surfaces: Operations owns day-to-day; Super Admin break-glass. */
export function assertOperationsOrSuperAdmin(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRole(user, [USER_ROLE.OPERATIONS, USER_ROLE.SUPER_ADMIN], actionLabel);
}

/** Store catalog write (products): Ops owner + Super Admin override. */
export function assertStoreCatalogManager(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRole(
    user,
    [USER_ROLE.OPERATIONS, USER_ROLE.SUPER_ADMIN],
    actionLabel,
  );
}

/** Marketing-owned surfaces; Super Admin break-glass override. */
export function assertMarketingOnly(
  user: JwtUserPayload,
  actionLabel = 'Marketing configuration',
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.MARKETING, USER_ROLE.SUPER_ADMIN],
    ['mkt_campaigns'],
    actionLabel,
  );
}

/** Marketing-owned surfaces; Super Admin may act for ops / break-glass. */
export function assertMarketingOrSuperAdmin(
  user: JwtUserPayload,
  actionLabel = 'Marketing configuration',
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.MARKETING, USER_ROLE.SUPER_ADMIN],
    ['mkt_campaigns'],
    actionLabel,
  );
}

/** Sales-owned surfaces; Super Admin break-glass override. */
export function assertSalesOnly(
  user: JwtUserPayload,
  actionLabel = 'Sales operation',
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.SALES, USER_ROLE.SUPER_ADMIN],
    ['crm_leads', 'crm_members'],
    actionLabel,
  );
}

/** Sales-owned member intake; Facilitator may register their own tribe members. */
export function assertSalesOrFacilitator(
  user: JwtUserPayload,
  actionLabel = 'Member registration',
): void {
  assertRole(
    user,
    [USER_ROLE.SALES, USER_ROLE.FACILITATOR, USER_ROLE.SUPER_ADMIN],
    actionLabel,
  );
}

/** Check-in surfaces; Super Admin break-glass override. */
export function assertOpsOrGateKeeper(
  user: JwtUserPayload,
  actionLabel = 'Check-in operation',
): void {
  assertRole(
    user,
    [USER_ROLE.OPERATIONS, USER_ROLE.GATE_KEEPER, USER_ROLE.SUPER_ADMIN],
    actionLabel,
  );
}

/** CRM / marketing / ops emit + client background worker (automation queue). */
export function assertAutomationEmitAllowed(
  user: JwtUserPayload,
  actionLabel = 'Automation emit',
): void {
  assertRole(
    user,
    [
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.OPERATIONS,
      USER_ROLE.MARKETING,
      USER_ROLE.FINANCE,
    ],
    actionLabel,
  );
}

export function assertAutomationQueueAccess(
  user: JwtUserPayload,
  actionLabel = 'Automation queue',
): void {
  assertRole(
    user,
    [
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.OPERATIONS,
      USER_ROLE.MARKETING,
      USER_ROLE.FINANCE,
    ],
    actionLabel,
  );
}

export function assertCampaignResourceAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.MARKETING, USER_ROLE.SUPER_ADMIN],
    ['mkt_campaigns'],
    actionLabel,
  );
}

export function assertDiscountResourceAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.MARKETING, USER_ROLE.SUPER_ADMIN],
    ['mkt_discounts'],
    actionLabel,
  );
}

export function assertCmsResourceAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.MARKETING, USER_ROLE.SUPER_ADMIN],
    ['cms_content'],
    actionLabel,
  );
}

export function assertCommunicationResourceAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.MARKETING, USER_ROLE.OPERATIONS, USER_ROLE.SUPER_ADMIN],
    ['sys_communication'],
    actionLabel,
  );
}

export function assertStoreInventoryResourceAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.OPERATIONS, USER_ROLE.MARKETING, USER_ROLE.SUPER_ADMIN],
    ['ops_inventory'],
    actionLabel,
  );
}

export function assertCrmMembersResourceAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [
      USER_ROLE.SALES,
      USER_ROLE.OPERATIONS,
      USER_ROLE.FINANCE,
      USER_ROLE.SUPER_ADMIN,
    ],
    ['crm_members'],
    actionLabel,
  );
}

export function assertCrmFacilitatorAssignmentAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.SUPER_ADMIN],
    ['crm_member_facilitator_assignment'],
    actionLabel,
  );
}

export function assertCrmLeadsResourceAccess(
  user: JwtUserPayload,
  actionLabel: string,
): void {
  assertRoleOrCustomResource(
    user,
    [USER_ROLE.SALES, USER_ROLE.MARKETING, USER_ROLE.SUPER_ADMIN],
    ['crm_leads'],
    actionLabel,
  );
}
