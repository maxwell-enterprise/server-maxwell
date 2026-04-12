/**
 * Seed rows for `automation_trigger_definitions`.
 * Kept in sync with `maxwell-refactor/src/constants/triggerCatalog.ts` plus
 * `EMAIL_WELCOME_SENT` from `masterEventRegistry.ts`.
 */
export type AutomationTriggerSeedRow = {
  id: string;
  label: string;
  description: string;
  category: string;
  iconName: string;
  variables: Array<{ key: string; label: string; example: string }>;
  sortOrder: number;
};

export const AUTOMATION_TRIGGER_SEED: AutomationTriggerSeedRow[] = [
  {
    id: 'PAYMENT_SUCCESS',
    label: 'Payment Received',
    description:
      'Triggered when a transaction is successfully settled (Gateway or Manual).',
    category: 'FINANCE',
    iconName: 'CreditCard',
    sortOrder: 10,
    variables: [
      { key: 'amount', label: 'Amount Paid', example: 'Rp 1.500.000' },
      { key: 'transaction_id', label: 'Transaction ID', example: 'TRX-9988' },
      {
        key: 'payment_method',
        label: 'Payment Method',
        example: 'Bank Transfer',
      },
    ],
  },
  {
    id: 'INVOICE_GENERATED',
    label: 'Invoice Issued',
    description: 'Triggered when a new invoice is created but not yet paid.',
    category: 'FINANCE',
    iconName: 'FileText',
    sortOrder: 20,
    variables: [
      { key: 'invoice_number', label: 'Invoice #', example: 'INV-2025-001' },
      { key: 'due_date', label: 'Due Date', example: '2025-01-01' },
      { key: 'amount', label: 'Total Amount', example: 'Rp 500.000' },
      {
        key: 'payment_link',
        label: 'Payment URL',
        example: 'https://pay.maxwell...',
      },
    ],
  },
  {
    id: 'INVOICE_OVERDUE',
    label: 'Invoice Overdue',
    description: 'Triggered daily for unpaid invoices past due date.',
    category: 'FINANCE',
    iconName: 'Clock',
    sortOrder: 30,
    variables: [
      { key: 'invoice_number', label: 'Invoice #', example: 'INV-2025-001' },
      { key: 'days_late', label: 'Days Overdue', example: '3' },
    ],
  },
  {
    id: 'COMMISSION_PAID',
    label: 'Commission Payout',
    description:
      'Triggered when Finance settles a commission payment to a facilitator.',
    category: 'FINANCE',
    iconName: 'DollarSign',
    sortOrder: 40,
    variables: [
      { key: 'amount', label: 'Payout Amount', example: 'Rp 2.500.000' },
      { key: 'period', label: 'Period', example: 'March 2025' },
    ],
  },
  {
    id: 'NEW_MEMBER_REGISTRATION',
    label: 'New Registration',
    description: 'Triggered when a new user creates an account.',
    category: 'CRM',
    iconName: 'UserPlus',
    sortOrder: 50,
    variables: [
      { key: 'join_date', label: 'Join Date', example: '2025-03-10' },
    ],
  },
  {
    id: 'NEW_MEMBER',
    label: 'New Member (Welcome Email)',
    description:
      'CRM/Auth: member created → queues welcome email via POST /fe/automations/emit.',
    category: 'CRM',
    iconName: 'UserPlus',
    sortOrder: 55,
    variables: [
      { key: 'member_name', label: 'Member name', example: 'Siti Aminah' },
      { key: 'email', label: 'Email', example: 'siti@example.com' },
      { key: 'join_date', label: 'Join date', example: '2025-04-13' },
    ],
  },
  {
    id: 'MEMBER_UPGRADE_VIP',
    label: 'VIP Upgrade',
    description: 'Triggered when a member reaches VIP tier (manual or auto).',
    category: 'CRM',
    iconName: 'Crown',
    sortOrder: 60,
    variables: [
      { key: 'old_tier', label: 'Previous Tier', example: 'Member' },
      { key: 'new_tier', label: 'New Tier', example: 'VIP' },
    ],
  },
  {
    id: 'LEAD_HOT_QUALIFIED',
    label: 'Hot Lead Detected',
    description: 'Triggered when AI Scout scores a lead > 8/10.',
    category: 'CRM',
    iconName: 'Flame',
    sortOrder: 70,
    variables: [
      { key: 'lead_score', label: 'Score', example: '9' },
      { key: 'interest', label: 'Interest', example: 'Private Coaching' },
    ],
  },
  {
    id: 'MEMBER_BIRTHDAY',
    label: 'Member Birthday',
    description: "Triggered at 8:00 AM on the member's birthday.",
    category: 'CRM',
    iconName: 'Gift',
    sortOrder: 80,
    variables: [{ key: 'age', label: 'Turning Age', example: '30' }],
  },
  {
    id: 'TICKET_ISSUED',
    label: 'Ticket Issued',
    description: 'Triggered when a QR code/Ticket is generated.',
    category: 'EVENT',
    iconName: 'Ticket',
    sortOrder: 90,
    variables: [
      {
        key: 'event_name',
        label: 'Event Name',
        example: 'Leadership Summit 2025',
      },
      {
        key: 'ticket_link',
        label: 'Ticket URL',
        example: 'https://maxwell.../ticket/123',
      },
      { key: 'event_date', label: 'Event Date', example: '2025-09-01' },
      { key: 'location', label: 'Venue', example: 'Grand Ballroom' },
    ],
  },
  {
    id: 'EVENT_REMINDER_14D',
    label: 'Event Reminder (H-14)',
    description: 'Triggered 2 weeks before event start.',
    category: 'EVENT',
    iconName: 'Calendar',
    sortOrder: 100,
    variables: [
      { key: 'event_name', label: 'Event Name', example: 'Leadership Summit' },
      { key: 'event_date', label: 'Date', example: '25 Agustus 2025' },
    ],
  },
  {
    id: 'EVENT_REMINDER_7D',
    label: 'Event Reminder (H-7)',
    description: 'Triggered 1 week before event start.',
    category: 'EVENT',
    iconName: 'Calendar',
    sortOrder: 110,
    variables: [
      { key: 'event_name', label: 'Event Name', example: 'Leadership Summit' },
      { key: 'location', label: 'Venue', example: 'Grand Ballroom' },
    ],
  },
  {
    id: 'EVENT_REMINDER_3D',
    label: 'Event Reminder (H-3)',
    description: 'Triggered 3 days before event start.',
    category: 'EVENT',
    iconName: 'Calendar',
    sortOrder: 120,
    variables: [
      { key: 'event_name', label: 'Event Name', example: 'Leadership Summit' },
    ],
  },
  {
    id: 'EVENT_REMINDER_24H',
    label: 'Event Reminder (H-1)',
    description: 'Triggered 24 hours before event start.',
    category: 'EVENT',
    iconName: 'Calendar',
    sortOrder: 130,
    variables: [
      { key: 'event_name', label: 'Event Name', example: 'Leadership Summit' },
      { key: 'start_time', label: 'Time', example: '09:00 WIB' },
    ],
  },
  {
    id: 'EVENT_CHECK_IN',
    label: 'Event Check-In',
    description: 'Triggered when a user scans their ticket at the venue.',
    category: 'EVENT',
    iconName: 'QrCode',
    sortOrder: 140,
    variables: [
      { key: 'check_in_time', label: 'Scan Time', example: '08:45 AM' },
      { key: 'event_name', label: 'Event Name', example: 'Leadership Summit' },
    ],
  },
  {
    id: 'SHIPPING_UPDATED',
    label: 'Item Shipped',
    description: 'Triggered when a tracking number is added to an order.',
    category: 'LOGISTICS',
    iconName: 'Truck',
    sortOrder: 150,
    variables: [
      { key: 'tracking_number', label: 'AWB / Resi', example: 'JNE882910' },
      { key: 'courier', label: 'Courier', example: 'JNE' },
      { key: 'items', label: 'Items Summary', example: 'Book x1' },
    ],
  },
  {
    id: 'ORDER_DELIVERED',
    label: 'Item Delivered',
    description: 'Triggered when courier confirms delivery.',
    category: 'LOGISTICS',
    iconName: 'PackageCheck',
    sortOrder: 160,
    variables: [{ key: 'delivery_date', label: 'Date', example: '2025-03-12' }],
  },
  {
    id: 'CONTRACT_READY',
    label: 'Contract Ready to Sign',
    description: 'Triggered when a draft contract is published to member.',
    category: 'SYSTEM',
    iconName: 'FileSignature',
    sortOrder: 170,
    variables: [
      {
        key: 'document_name',
        label: 'Doc Title',
        example: 'Facilitator Agreement',
      },
      { key: 'sign_link', label: 'Signing URL', example: 'https://...' },
    ],
  },
  {
    id: 'CONTRACT_SIGNED',
    label: 'Contract Signed',
    description: 'Triggered when member successfully signs.',
    category: 'SYSTEM',
    iconName: 'CheckCircle',
    sortOrder: 180,
    variables: [
      { key: 'signed_date', label: 'Date Signed', example: '2025-03-01' },
    ],
  },
  {
    id: 'EMAIL_WELCOME_SENT',
    label: 'Welcome Email Sent',
    description: 'Triggered when onboarding email is dispatched.',
    category: 'SYSTEM',
    iconName: 'Mail',
    sortOrder: 190,
    variables: [
      { key: 'member_name', label: 'Recipient', example: 'New User' },
    ],
  },
];
