import { BadRequestException } from '@nestjs/common';

/**
 * Central contract between automation callers (simulator, future server jobs) and
 * email templates designed in admin. Only listed keys are forwarded to {{placeholders}}.
 *
 * Keep in sync with: Front/maxwell-refactor/src/constants/emailAutomationPayloadContracts.ts
 */
export type SupportedEmailAutomationTriggerId = 'EMAIL_WELCOME_SENT';

export interface EmailTriggerPayloadContract {
  readonly allowedVariableKeys: readonly string[];
  readonly requiredVariableKeys: readonly string[];
  /** Key in `variables` whose string value is the recipient email (must be valid email). */
  readonly recipientEmailKey: string;
}

export const EMAIL_TRIGGER_PAYLOAD_CONTRACTS: Record<
  SupportedEmailAutomationTriggerId,
  EmailTriggerPayloadContract
> = {
  EMAIL_WELCOME_SENT: {
    allowedVariableKeys: [
      'memberId',
      'member_name',
      'name',
      'email',
      'phone',
    ],
    requiredVariableKeys: ['email'],
    recipientEmailKey: 'email',
  },
};

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertSupportedEmailTrigger(
  triggerId: string,
): asserts triggerId is SupportedEmailAutomationTriggerId {
  if (!Object.prototype.hasOwnProperty.call(EMAIL_TRIGGER_PAYLOAD_CONTRACTS, triggerId)) {
    throw new BadRequestException(
      `Unknown or unsupported email automation trigger: ${triggerId}`,
    );
  }
}

export function normalizeEmailTriggerVariables(
  triggerId: SupportedEmailAutomationTriggerId,
  raw: Record<string, unknown>,
): Record<string, string> {
  const contract = EMAIL_TRIGGER_PAYLOAD_CONTRACTS[triggerId];
  const out: Record<string, string> = {};

  for (const key of contract.allowedVariableKeys) {
    const v = raw[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      out[key] = String(v).trim();
    }
  }

  for (const req of contract.requiredVariableKeys) {
    if (!out[req]) {
      throw new BadRequestException(
        `Missing required automation variable "${req}" for trigger ${triggerId}`,
      );
    }
  }

  const to = out[contract.recipientEmailKey];
  if (!EMAIL_RE.test(to)) {
    throw new BadRequestException(
      `Invalid recipient email in variable "${contract.recipientEmailKey}"`,
    );
  }

  return out;
}
