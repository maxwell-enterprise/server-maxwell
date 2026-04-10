/** Supabase Realtime Broadcast hub for account-deletion queue updates (Super Admin UI + profile refresh). */
export const ACCOUNT_DELETION_BROADCAST_CHANNEL = 'account_deletion_hub';

/** Client `.on('broadcast', { event })` name. */
export const ACCOUNT_DELETION_BROADCAST_EVENT = 'queue_changed';
