"use client";

export function PerformanceDayFilter({
  date,
  today,
  employeeId,
}: {
  date: string;
  today: string;
  employeeId?: string;
}) {
  return (
    <form
      className="card card-body"
      aria-label="Daily performance count"
      action="/performance"
      method="get"
      style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}
    >
      <input type="hidden" name="preset" value="day" />
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      <label className="field">
        <span>Daily count date</span>
        <input
          type="date"
          name="date"
          defaultValue={date}
          max={today}
          required
          onChange={(event) => {
            if (event.currentTarget.validity.valid && event.currentTarget.value)
              event.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
      <button className="button button-primary">Show daily count</button>
      <span className="muted">
        Choose one date. If it does not load automatically, select Show daily count.
      </span>
    </form>
  );
}
