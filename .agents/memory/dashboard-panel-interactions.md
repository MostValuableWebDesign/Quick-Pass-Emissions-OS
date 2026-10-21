---
name: Performance panel interactions
description: Presentation-only layout scope and reliable cross-input dashboard controls.
---

Performance panel order and size are personal account preferences available across devices, not shared business or payroll settings.

**Why:** The user chose to save layouts across their devices. Customizing a dashboard must not change selected dates, employee attribution, pay inputs, commissions or data coverage for anyone.

**How to apply:** Keep layout persistence separate from business data and scoped to the signed-in account. Account preferences take precedence over browser caches; do not let one user's cache override another's layout. Preserve the date-selection and calculation contracts when adding or rearranging widgets.

Use pointer-driven panel grips with keyboard alternatives, and retain full-width panels on narrow screens.

**Why:** Native HTML drag-and-drop on a button grip failed the real browser check; pointer capture worked and also supports touch. Keyboard controls remain necessary for non-pointer users.

**How to apply:** Verify drag, resize, reload persistence and reset in an owned isolated browser flow. Do not switch the managed preview to a fixture database for presentation testing.

Resizing must use a visible corner grab handle, not a header toolbar button.

**Why:** The user explicitly said panels should have a grab handle to resize, “not the button.”

**How to apply:** Keep the resize grip at the panel corner while retaining keyboard resizing and personal account persistence.

Keep each panel's layout controls at the right side of its header, separate from the title and description.

**Why:** The user wants the panel controls on the right for every Performance panel.

**How to apply:** Align panel actions with other header controls on the right, and allow them to wrap cleanly on narrow cards.

Panels whose combined widths fit must sit side by side, including narrower workspace and tablet previews.

**Why:** The user explicitly requested panels alongside one another when resized to dimensions that fit. A broad mobile breakpoint was forcing stacked layouts in workspace previews.

**How to apply:** Keep the grid's stacking breakpoint and the resize handle's horizontal-resize breakpoint aligned. Stack on small phones without overwriting saved desktop widths.

Keep the Reset panels control directly beside the movable panel area, not in the page header.

**Why:** The user asked for the reset button to be close to the panels that can be moved.

**How to apply:** Place layout-reset controls immediately above their panel grid; do not mix them with data-refresh or payroll actions.

Performance tables must fit the available panel width without horizontal scrolling, including when a panel is resized.

**Why:** The user wants employee data and columns visible together without having to scroll sideways.

**How to apply:** Let table columns size from their content, center numeric headers and values, wrap labels and secondary details, and adapt spacing to narrower panels instead of imposing a wide minimum. Keep the Employees panel compact for fewer than seven rows while ensuring the rows fit; preserve deliberately larger saved sizes. Performance currency and timing are whole numbers, and weekly base reference stays separate from selected-period base.

All date-based Performance panels must use one applied report window. Trend period presets update that shared window; the trend chart may group the shared dates daily or monthly.

**Why:** The owner confirmed separate report dates and trend dates caused contradictory panel totals and chose one shared date range.

**How to apply:** Keep one reporting date control: place presets such as Past 7 Days, Year to Date or All Time beside the single-day/range toggle, not as a second Trend selector. Do not show separate “Report scope” or “Selected date” side summaries. Calendar or preset changes set the dates used by cars, revenue, pay, employee results, trends and vehicle-return counts. Prior visits may identify a returning VIN but must not be added to selected-window totals. Keep employee focus consistent and incomplete coverage distinct from zero.

Dashboard Needs attention includes live certificate-threshold alerts and calendar-based payday reminders. The payday reminder stays in the business panel through its active date window even when the account-specific banner is acknowledged.

**Why:** The user wants low-certificate and payroll alerts in Needs attention. Dismissing a personal banner should not hide an active business due-date reminder.

**How to apply:** Use the saved provider balance and configured inclusive threshold for certificate alerts, deduplicating a recorded-stock warning when the provider count is already low. Keep the dashboard payday item date-driven from the established payday calendar; do not couple it to the top banner's per-account acknowledgement.

Vehicle-history presentation should keep useful return statistics visible and concise, without a "More details" section or separate repeat-inspection event total.

**Why:** The owner found the trend-timeframe panels confusing and wordy, rejected hiding useful information, and chose unique returning vehicles rather than a separate inspection-event count.

**How to apply:** Prioritize easily scanned unique-vehicle return figures, short labels and meaningful comparisons. Keep necessary incomplete-data warnings concise; do not mix free-retest-inclusive physical counts with vehicle-retention figures.
