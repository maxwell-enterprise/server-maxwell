import { ServiceUnavailableException } from '@nestjs/common';
import { CommunicationEmailService } from './communication-email.service';

describe('CommunicationEmailService', () => {
  it('lists templates without linkedTriggerId when the column is missing', async () => {
    const db = {
      query: jest.fn(async (sql: string, params?: readonly unknown[]) => {
        if (sql.includes('FROM information_schema.columns')) {
          const [tableName, columnName] = params ?? [];
          if (
            tableName === 'email_templates' &&
            columnName === 'linkedTriggerId'
          ) {
            return { rows: [{ exists: false }] };
          }
        }
        if (
          sql.includes('FROM email_templates') &&
          !sql.includes('"linkedTriggerId"')
        ) {
          return {
            rows: [
              {
                id: 'TPL-1',
                name: 'Welcome',
                category: 'TRANSACTIONAL',
                subject: 'Hello',
                body: '<p>Hi</p>',
                variables: ['name'],
              },
            ],
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    } as any;

    const service = new CommunicationEmailService(db);
    await expect(service.listTemplates()).resolves.toEqual([
      {
        id: 'TPL-1',
        name: 'Welcome',
        category: 'TRANSACTIONAL',
        subject: 'Hello',
        body: '<p>Hi</p>',
        variables: ['name'],
        linkedTriggerId: undefined,
      },
    ]);
  });

  it('throws a directed error for send-by-trigger when linkedTriggerId column is missing', async () => {
    const db = {
      query: jest.fn(async (sql: string, params?: readonly unknown[]) => {
        if (sql.includes('FROM information_schema.columns')) {
          const [tableName, columnName] = params ?? [];
          if (
            tableName === 'email_templates' &&
            columnName === 'linkedTriggerId'
          ) {
            return { rows: [{ exists: false }] };
          }
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    } as any;

    const service = new CommunicationEmailService(db);

    await expect(
      service.sendTransactionalByTrigger({
        triggerId: 'EMAIL_WELCOME_SENT',
        variables: {
          name: 'Budi',
          member_name: 'Budi',
          memberId: 'M-1',
          email: 'budi@example.com',
          phone: '08123',
        },
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
