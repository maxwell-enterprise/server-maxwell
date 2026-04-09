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
  assertRole(user, [USER_ROLE.FINANCE], actionLabel);
}

export function assertOperationsOnly(
  user: JwtUserPayload,
  actionLabel = 'Operational configuration',
): void {
  assertRole(user, [USER_ROLE.OPERATIONS], actionLabel);
}

export function assertMarketingOnly(
  user: JwtUserPayload,
  actionLabel = 'Marketing configuration',
): void {
  assertRole(user, [USER_ROLE.MARKETING], actionLabel);
}

export function assertSalesOnly(
  user: JwtUserPayload,
  actionLabel = 'Sales operation',
): void {
  assertRole(user, [USER_ROLE.SALES], actionLabel);
}

export function assertOpsOrGateKeeper(
  user: JwtUserPayload,
  actionLabel = 'Check-in operation',
): void {
  assertRole(user, [USER_ROLE.OPERATIONS, USER_ROLE.GATE_KEEPER], actionLabel);
}
