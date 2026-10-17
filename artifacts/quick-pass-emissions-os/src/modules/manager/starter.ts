// Owner-supplied duties; durations and clock times are editable planning suggestions.
export const weeklyStructure = [
  ["Monday", "Payroll completion, weekly priorities, staffing and inventory"],
  ["Tuesday", "Dealership billing, deposits and marketing"],
  ["Wednesday", "Property/equipment review and website checks"],
  ["Thursday", "Vendor follow-ups, promotions and community relationships"],
  ["Friday", "Weekly performance review, payroll preparation and next-week planning"],
  ["Saturday", "Service readiness, customer flow and unresolved operational issues"],
] as const;
export const starterDuties = [
  {
    key: "opening",
    title: "Daily service readiness",
    area: "PROPERTY",
    frequency: "DAILY",
    weekdays: [],
    time: "08:00",
    minutes: 20,
    priority: "HIGH",
    description:
      "Check analyzer operation, kiosk availability, cameras, drain pits, leaks, wash equipment, hoses, brushes, spray guns, nozzles and spray tips. Record availability in Equipment/Carwash; report issues in Maintenance. Critical equipment or camera failure needs urgent follow-up. No training or licensing tasks.",
  },
  {
    key: "closing",
    title: "Daily closing review",
    area: "GENERAL",
    frequency: "DAILY",
    weekdays: [],
    time: "18:00",
    minutes: 20,
    priority: "NORMAL",
    description:
      "Review unresolved issues, customer-service problems and tomorrow’s needs. Suggested deadline only; adjust for Saturday and personal availability.",
  },
  ...weeklyStructure.map(([day, title], i) => ({
    key: `weekly-${i + 1}`,
    title,
    area: ["PAYROLL", "BILLING", "PROPERTY", "MARKETING", "PAYROLL", "GENERAL"][i],
    frequency: "WEEKLY",
    weekdays: [i + 1],
    time: "16:00",
    minutes: 45,
    priority: i === 0 ? "HIGH" : "NORMAL",
    description: `${day} editable work block. Inventory: Walmart copy paper, soap, tissue paper, paper towels; Amazon receipt paper and plastic tag scrapers; printer/ink through OPUS, Best Buy or existing family contact. Review foam soap, tire cleaner, high-pressure soap and clear wax in Chemicals. Never infer a stock level or initiate a purchase.`,
  })),
  ...[
    "Prepare payroll",
    "Review payroll sources",
    "Approve payroll",
    "Confirm payroll payment",
  ].map((title, i) => ({
    key: `payroll-${i}`,
    title,
    area: "PAYROLL",
    frequency: "WEEKLY",
    weekdays: [i === 0 ? 5 : 1],
    time: i === 0 ? "16:00" : "17:00",
    minutes: 20,
    priority: "HIGH",
    description:
      "Monday payday. Use existing Payroll & commissions for earned, reviewed and approved amounts. Payment confirmation is separate evidence; completing this task does not pay anyone. Grass cutting must be verified and included once in approved pay, never paid from a task.",
  })),
  {
    key: "website",
    title: "Review quickpassemissions.com",
    area: "WEBSITE",
    frequency: "WEEKLY",
    weekdays: [3],
    time: "16:00",
    minutes: 30,
    priority: "NORMAL",
    description:
      "Check hours, holiday exceptions, contact details, tap-to-call, directions, mobile usability, forms if present, broken links, promotion accuracy and outdated content. Record preview/evidence and request manager review. Do not publish or deploy.",
  },
  {
    key: "marketing",
    title: "Marketing and community calendar review",
    area: "MARKETING",
    frequency: "WEEKLY",
    weekdays: [4],
    time: "16:00",
    minutes: 30,
    priority: "NORMAL",
    description:
      "Plan Google Business Profile updates, social content, review-response drafts, local/dealership partnerships and Chamber meetings. Confirm meeting dates. Use existing campaigns for objectives, budget, drafts, approval and measured results. Never publish or send automatically.",
  },
] as const;
export const vendorContacts = [
  {
    name: "OPUS analyzer support",
    phone: "800-526-9574",
    reference: "Tech ID 101152",
    services: "Analyzer support",
  },
  { name: "Termayne", phone: "", reference: "Phone not supplied", services: "Cameras / security" },
  { name: "Chris, Pit Pro", phone: "478-733-2523", reference: "", services: "Drain-pit service" },
  {
    name: "The Advanced Group",
    phone: "770-419-0043",
    reference: "",
    services: "Carwash equipment, pumps and mechanical service",
  },
  {
    name: "KleenRite",
    phone: "800-233-3873",
    reference: "Customer number 133632",
    services: "Wash parts and supplies",
  },
] as const;
