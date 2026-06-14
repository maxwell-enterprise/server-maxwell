import { SystemAdminService } from './system-admin.service';

describe('SystemAdminService.listAutomationConnections', () => {
  it('skips email template linkage query when linkedTriggerId column is missing', async () => {
    const db = {
      query: jest.fn(async (sql: string, params?: readonly unknown[]) => {
        if (sql.includes('FROM automation_trigger_definitions')) {
          return { rows: [{ id: 'EMAIL_WELCOME_SENT' }] };
        }
        if (sql.includes('FROM information_schema.columns')) {
          const [tableName, columnName] = params ?? [];
          if (
            tableName === 'whatsapp_templates' &&
            columnName === 'linkedTriggerId'
          ) {
            return { rows: [{ exists: true }] };
          }
          if (
            tableName === 'email_templates' &&
            columnName === 'linkedTriggerId'
          ) {
            return { rows: [{ exists: false }] };
          }
        }
        if (sql.includes('FROM whatsapp_templates')) {
          return {
            rows: [
              {
                linkedTriggerId: 'EMAIL_WELCOME_SENT',
                label: 'Welcome WA',
              },
            ],
          };
        }
        if (sql.includes('FROM ops_templates')) {
          return { rows: [] };
        }
        if (sql.includes('FROM gamification_rules')) {
          return { rows: [] };
        }
        if (sql.includes('FROM gamification_badges')) {
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    } as any;

    const service = new SystemAdminService(db);
    const result = await service.listAutomationConnections();

    expect(result).toEqual([
      {
        triggerId: 'EMAIL_WELCOME_SENT',
        communication: {
          whatsappTemplateLabels: ['Welcome WA'],
          emailTemplateNames: [],
        },
        operations: {
          workflowNames: [],
        },
        gamification: {
          rulePoints: 0,
          badgeBonusPoints: 0,
          badgeNames: [],
        },
      },
    ]);
    expect(
      db.query.mock.calls.some((call: [string]) =>
        call[0].includes('FROM email_templates'),
      ),
    ).toBe(false);
  });
});
