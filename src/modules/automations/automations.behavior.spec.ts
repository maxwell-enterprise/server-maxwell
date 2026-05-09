import { AutomationsEmitService } from './automations-emit.service';
import { AutomationQueueWorkerService } from './automation-queue-worker.service';

describe('Automations behavior', () => {
  describe('AutomationsEmitService.simulate', () => {
    it('queues non-member triggers using original trigger id', async () => {
      const systemAdmin = {
        upsertAutomationQueueItem: jest.fn().mockResolvedValue(undefined),
        insertBackgroundJob: jest
          .fn()
          .mockResolvedValue({ id: 'JOB-1' }),
      } as any;
      const service = new AutomationsEmitService(systemAdmin);

      const payload = { member_name: 'Budi Santoso', amount: 1500000 };
      const result = await service.simulate({
        triggerId: 'PAYMENT_SUCCESS',
        payload,
      });

      expect(result.ok).toBe(true);
      expect(result.backgroundJobId).toBe('JOB-1');
      expect(systemAdmin.upsertAutomationQueueItem).toHaveBeenCalledTimes(1);
      const [, body] = systemAdmin.upsertAutomationQueueItem.mock.calls[0];
      expect(body.triggerType).toBe('PAYMENT_SUCCESS');
      expect(body.status).toBe('PENDING');
      expect(body.description).toContain('PAYMENT_SUCCESS');
      expect(body.contextData).toMatchObject(payload);
    });
  });

  describe('AutomationQueueWorkerService.runOneTick', () => {
    it('marks SIMULATED_TRIGGER as COMPLETED (not FAILED)', async () => {
      let claimCount = 0;
      const db = {
        withTransaction: jest.fn(async (cb: any) => {
          claimCount += 1;
          const rows =
            claimCount === 1
              ? [
                  {
                    id: 'Q-1',
                    triggerType: 'SIMULATED_TRIGGER',
                    contextData: {
                      triggerId: 'PAYMENT_SUCCESS',
                      payload: { amount: 1500000 },
                    },
                    description: 'Simulated trigger PAYMENT_SUCCESS',
                  },
                ]
              : [];
          return cb({
            query: jest.fn().mockResolvedValue({ rows }),
          });
        }),
        query: jest.fn().mockResolvedValue({}),
      } as any;

      const email = {
        sendTransactionalByTrigger: jest.fn(),
      } as any;
      const orchestrator = {
        processTrigger: jest.fn().mockResolvedValue(undefined),
      } as any;

      const worker = new AutomationQueueWorkerService(db, email, orchestrator);
      await worker.runOneTick();

      expect(email.sendTransactionalByTrigger).not.toHaveBeenCalled();
      expect(orchestrator.processTrigger).toHaveBeenCalledWith(
        'PAYMENT_SUCCESS',
        { amount: 1500000 },
      );
      expect(db.query).toHaveBeenCalled();
      const finishCalls = db.query.mock.calls.filter((call: any[]) =>
        String(call[0]).includes('UPDATE automation_queue'),
      );
      expect(finishCalls.length).toBeGreaterThan(0);
      const lastParams = finishCalls[finishCalls.length - 1][1];
      expect(lastParams[0]).toBe('Q-1');
      expect(lastParams[1]).toBe('COMPLETED');
      expect(lastParams[2]).toBeNull();
    });
  });
});
