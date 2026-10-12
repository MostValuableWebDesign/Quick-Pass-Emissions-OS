---
name: Settings and operations UI scope
description: User-defined locations and removed panels for Quick Pass settings and navigation.
---

The Station settings editing panel is retired from the Settings page. Its saved configuration remains in use by Performance calculations.

**Why:** The user later requested removal of Station settings under Emissions & certificates, superseding the earlier request to display the panel in Settings.

**How to apply:** Do not restore the editing panel without a new request. Preserve saved station settings, the calculations that depend on them, and the separate Business operating days configuration.

Account & password belongs beneath Settings, and pay setup belongs in Payroll rather than Performance. Group Settings by related business operations, Emissions configuration, and activity.

**Why:** The user requested these locations and a better-organized Settings area.

**How to apply:** Keep pay setup in Payroll. Retire the Performance setup screen without deleting saved data or station-import capabilities.

Settings is a side-menu button: hover opens its flyout, while keyboard focus and mobile tap also expose its destinations. The Business settings page belongs in that menu. The separate Station data and Business configuration import/review pages are retired and redirect to Business settings. Keep saved station configuration and calculations, but do not restore its removed editing panel. Group Reminders & notifications, Account & security, and Automation under Settings. Dealership invoices and payments remain grouped in a side-menu flyout.

**Why:** The user wants Settings presented as a hover-triggered button and said the standalone Station data and Business configuration import/review pages are not needed.

**How to apply:** Keep Business settings as a child link in its purpose-based category, and never navigate directly from the Settings trigger. Do not restore the retired pages, links, or Station settings editing panel; do not delete saved data or station calculations. Preserve Dealership flyouts, role restrictions, and accessible keyboard/mobile navigation.

The user removed the Issued By mappings, Outcome rules & prices, Operations scheduler, Product roadmap, Data storage & recovery, and sidebar slogan panels as unnecessary.

**Why:** The user explicitly requested those visible panels be removed.

**How to apply:** Do not restore these panels without asking. Removing their UI does not authorize deleting persisted configuration or the calculations that use it.

Add-dealership, add-employee, and add-vendor forms should open in popup panes, with the right-aligned add buttons remaining above their directories.

**Why:** The user wants to add records without opening a form that pushes the existing panels down, and wants the popup to close after a successful save.

**How to apply:** Preserve the directory’s position while the form is open. Close the popup only after a successful save, and keep it open when validation or saving fails so the form can be corrected.
