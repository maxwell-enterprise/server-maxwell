type Primitive = string | number | boolean | null;
type Jsonish =
  | Primitive
  | Primitive[]
  | Record<string, Primitive | Primitive[]>;

export type InvitationEmailLogEntry = {
  event: string;
  status: 'queued' | 'started' | 'sent' | 'skipped' | 'fallback' | 'failed';
  targetEmail?: string | null;
  giftId?: string | null;
  itemName?: string | null;
  donorName?: string | null;
  reason?: string | null;
  metadata?: Record<string, Jsonish>;
};

export function appendInvitationEmailLog(
  entry: InvitationEmailLogEntry,
): Promise<void> {
  return new Promise((resolve) => {
    try {
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          ...entry,
        })}\n`,
      );
    } catch {
      // Logging should never block the invitation flow.
    }
    resolve();
  });
}
