/** Sample knowledge for demo / onboarding — business management platform */

export const SAMPLE_OVERVIEW = {
  projectSummary:
    'A cloud-based business management platform for appointments, inventory, billing, and customer relationships. Targets small-to-medium service businesses in India with GST compliance.',
  businessType: 'SaaS / Business Management',
  industry: 'Healthcare, Salons, Professional Services',
  targetUsers: 'Business owners, receptionists, managers, customers, employees',
  goals: JSON.stringify([
    'Streamline appointment booking and reduce no-shows',
    'Automate billing and GST-compliant invoicing',
    'Centralize customer and inventory data',
    'Provide actionable business reports'
  ]),
  objectives: JSON.stringify([
    'Launch MVP within 6 months',
    'Support 1,000 concurrent users',
    'Integrate payment and notification channels'
  ]),
  scope:
    'Web and mobile apps for booking, CRM, inventory, billing, employee management, and reporting. Admin dashboard and customer portal.',
  outOfScope: 'Multi-language support, international tax, native desktop apps',
  vision: 'Become the default operations platform for Indian SMB service businesses.'
}

export const SAMPLE_MODULES = [
  {
    title: 'Appointment',
    description: 'Scheduling, booking, reminders, and calendar management',
    priority: 'high',
    status: 'planned'
  },
  {
    title: 'Inventory',
    description: 'Stock tracking, purchase orders, and low-stock alerts',
    priority: 'high',
    status: 'planned'
  },
  {
    title: 'Billing',
    description: 'Invoicing, payments, GST, and receipts',
    priority: 'high',
    status: 'planned'
  },
  {
    title: 'CRM',
    description: 'Customer profiles, history, and communication',
    priority: 'medium',
    status: 'planned'
  },
  {
    title: 'Reports',
    description: 'Sales, inventory, appointment, and employee analytics',
    priority: 'medium',
    status: 'planned'
  }
] as const

export const SAMPLE_FEATURES_BY_MODULE: Record<string, { title: string; description: string; complexity: string }[]> = {
  Appointment: [
    { title: 'Online Booking', description: 'Customer self-service slot selection', complexity: 'medium' },
    { title: 'Reschedule', description: 'Change appointment date/time with rules', complexity: 'low' },
    { title: 'Cancel', description: 'Cancellation with policy enforcement', complexity: 'low' },
    { title: 'Reminder', description: 'SMS/email reminders before appointments', complexity: 'medium' },
    { title: 'Calendar View', description: 'Staff calendar with drag-and-drop', complexity: 'high' }
  ],
  Inventory: [
    { title: 'Stock In/Out', description: 'Record inventory movements', complexity: 'medium' },
    { title: 'Low Stock Alert', description: 'Notify when below threshold', complexity: 'low' },
    { title: 'Supplier Management', description: 'Vendor contacts and PO history', complexity: 'medium' }
  ],
  Billing: [
    { title: 'Invoice Generation', description: 'GST-compliant invoices', complexity: 'medium' },
    { title: 'Payment Collection', description: 'Razorpay/Stripe integration', complexity: 'high' },
    { title: 'Receipt Email', description: 'Auto-send receipts to customers', complexity: 'low' }
  ],
  CRM: [
    { title: 'Customer Profile', description: 'Contact info and preferences', complexity: 'low' },
    { title: 'Visit History', description: 'Past appointments and purchases', complexity: 'medium' },
    { title: 'Notes & Tags', description: 'Staff notes on customer records', complexity: 'low' }
  ],
  Reports: [
    { title: 'Sales Report', description: 'Revenue by period and service', complexity: 'medium' },
    { title: 'Inventory Report', description: 'Stock levels and valuation', complexity: 'medium' },
    { title: 'Appointment Report', description: 'Utilization and no-show rates', complexity: 'low' }
  ]
}

export const SAMPLE_ROLES = [
  {
    name: 'Owner',
    description: 'Full system access and configuration',
    permissions: JSON.stringify(['all']),
    modules: JSON.stringify(['all'])
  },
  {
    name: 'Manager',
    description: 'Operations oversight without billing settings',
    permissions: JSON.stringify(['read', 'write', 'reports']),
    modules: JSON.stringify(['Appointment', 'Inventory', 'CRM', 'Reports'])
  },
  {
    name: 'Receptionist',
    description: 'Front desk booking and customer check-in',
    permissions: JSON.stringify(['appointments', 'crm_read', 'crm_write']),
    modules: JSON.stringify(['Appointment', 'CRM'])
  },
  {
    name: 'Customer',
    description: 'Self-service portal for booking and payments',
    permissions: JSON.stringify(['book', 'pay', 'view_history']),
    modules: JSON.stringify(['Appointment', 'Billing'])
  },
  {
    name: 'Employee',
    description: 'Staff schedule and assigned tasks',
    permissions: JSON.stringify(['calendar', 'tasks']),
    modules: JSON.stringify(['Appointment'])
  }
]

export const SAMPLE_STAKEHOLDERS = [
  {
    name: 'Product Owner',
    role: 'Sponsor',
    responsibilities: 'Vision, priorities, release approval',
    contactNotes: 'Weekly sync Mondays'
  },
  {
    name: 'Operations Lead',
    role: 'Business SME',
    responsibilities: 'Workflow validation, UAT',
    contactNotes: 'Domain expert for appointment rules'
  }
]

export const SAMPLE_REQUIREMENTS = [
  {
    code: 'REQ-001',
    title: 'Online appointment booking',
    description: 'Customers can book available slots without staff intervention',
    type: 'functional',
    priority: 'high',
    status: 'draft',
    acceptanceCriteria: JSON.stringify([
      'Show real-time availability',
      'Confirm booking via email/SMS',
      'Prevent double booking'
    ])
  },
  {
    code: 'REQ-002',
    title: 'GST invoice generation',
    description: 'System generates GST-compliant invoices for all payments',
    type: 'functional',
    priority: 'high',
    status: 'draft'
  },
  {
    code: 'REQ-003',
    title: 'Inventory cannot go negative',
    description: 'Stock levels must not drop below zero on checkout',
    type: 'functional',
    priority: 'high',
    status: 'approved'
  },
  {
    code: 'NFR-001',
    title: 'API response time',
    description: '95th percentile API latency under 300ms for core endpoints',
    type: 'non_functional',
    nfrCategory: 'performance',
    priority: 'high',
    status: 'draft'
  },
  {
    code: 'NFR-002',
    title: 'Data encryption',
    description: 'PII encrypted at rest and in transit (TLS 1.2+)',
    type: 'non_functional',
    nfrCategory: 'security',
    priority: 'high',
    status: 'draft'
  }
]

export const SAMPLE_BUSINESS_RULES = [
  {
    title: 'No overlapping appointments',
    description: 'Same resource cannot have two appointments at the same time'
  },
  {
    title: 'No cancel after payment',
    description: 'Customers cannot cancel appointments after payment is captured'
  },
  {
    title: 'Negative inventory blocked',
    description: 'Inventory cannot become negative on any transaction'
  }
]

export const SAMPLE_API_ENDPOINTS = [
  { method: 'POST', path: '/api/auth/login', description: 'User authentication', authentication: 'Public' },
  { method: 'POST', path: '/api/appointments', description: 'Create appointment', authentication: 'JWT Bearer' },
  { method: 'GET', path: '/api/customers', description: 'List customers with pagination', authentication: 'JWT Bearer' },
  { method: 'PUT', path: '/api/inventory/:id', description: 'Update stock level', authentication: 'JWT Bearer' }
]

export const SAMPLE_ENTITIES = [
  {
    name: 'Customer',
    fields: JSON.stringify(['id', 'name', 'email', 'phone', 'gstin', 'created_at']),
    relationships: JSON.stringify(['Appointment', 'Invoice'])
  },
  {
    name: 'Appointment',
    fields: JSON.stringify(['id', 'customer_id', 'staff_id', 'start_at', 'end_at', 'status']),
    relationships: JSON.stringify(['Customer', 'Employee'])
  },
  {
    name: 'Invoice',
    fields: JSON.stringify(['id', 'customer_id', 'amount', 'gst_amount', 'status', 'paid_at'])
  },
  {
    name: 'Product',
    fields: JSON.stringify(['id', 'sku', 'name', 'quantity', 'reorder_level'])
  }
]

export const SAMPLE_INTEGRATIONS = [
  { name: 'Razorpay', type: 'Payment', description: 'Payment gateway for India' },
  { name: 'WhatsApp', type: 'Messaging', description: 'Appointment reminders' },
  { name: 'SMS', type: 'Messaging', description: 'OTP and notifications' },
  { name: 'Email', type: 'Messaging', description: 'Transactional emails' },
  { name: 'GST', type: 'Compliance', description: 'GST calculation and reporting' },
  { name: 'Google Calendar', type: 'Calendar', description: 'Staff calendar sync' }
]

export const SAMPLE_RISKS = [
  {
    title: 'Payment failure',
    description: 'Gateway downtime blocks checkout',
    severity: 'high',
    mitigation: 'Retry queue and alternate gateway fallback'
  },
  {
    title: 'Duplicate booking',
    description: 'Race condition on popular slots',
    severity: 'medium',
    mitigation: 'Optimistic locking on slot reservation'
  },
  {
    title: 'Data loss',
    description: 'Database failure without backup',
    severity: 'high',
    mitigation: 'Daily automated backups with 30-day retention'
  }
]

export const SAMPLE_ASSUMPTIONS = [
  { title: 'English only', description: 'UI and notifications in English for v1' },
  { title: 'Single country', description: 'India-only deployment and GST' },
  { title: 'Cloud deployment', description: 'Hosted on AWS or equivalent' }
]

export const SAMPLE_DECISIONS = [
  {
    title: 'Authentication',
    decision: 'JWT',
    reason: 'Stateless API, mobile-friendly',
    category: 'Security'
  },
  {
    title: 'Database',
    decision: 'PostgreSQL',
    reason: 'Relational data, ACID for billing',
    category: 'Technology'
  }
]

export const SAMPLE_REPORTS = [
  { title: 'Sales Report', description: 'Revenue by service and period' },
  { title: 'Inventory Report', description: 'Stock valuation and movement' },
  { title: 'Appointment Report', description: 'Bookings, cancellations, utilization' },
  { title: 'Employee Report', description: 'Staff performance and hours' }
]

export const SAMPLE_WORKFLOWS = [
  {
    title: 'Booking Flow',
    description: 'Select service → Pick slot → Confirm → Pay → Reminder → Check-in'
  },
  {
    title: 'Billing Flow',
    description: 'Generate invoice → Apply GST → Collect payment → Send receipt'
  }
]
