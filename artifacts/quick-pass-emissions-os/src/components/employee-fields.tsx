import type { Employee, User } from "@prisma/client";
import { Field } from "./action-form";
export function EmployeeFields({
  employee,
  owner,
}: {
  employee?: Employee & { user: User };
  owner: boolean;
}) {
  return (
    <>
      <Field label="Full name">
        <input name="name" required maxLength={160} defaultValue={employee?.user.name} />
      </Field>
      <Field label="Contact email (cannot change after creation)">
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          defaultValue={employee?.user.email}
          readOnly={!!employee}
        />
      </Field>
      <Field label="App access">
        <select
          name="role"
          defaultValue={
            employee?.user.role === "BOOKKEEPER" ? "EMPLOYEE" : (employee?.user.role ?? "EMPLOYEE")
          }
        >
          {(owner ? ["EMPLOYEE", "ADMIN", "OWNER"] : ["EMPLOYEE"]).map((r) => (
            <option key={r} value={r}>
              {r === "EMPLOYEE"
                ? "Staff record — no app access"
                : r === "ADMIN"
                  ? "Manager"
                  : "Owner"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Phone">
        <input name="phone" maxLength={50} defaultValue={employee?.phone} />
      </Field>
      <Field label="Start date">
        <input type="date" name="startDate" defaultValue={employee?.startDate ?? ""} />
      </Field>
      <Field label="Certification expiry (optional)">
        <input
          type="date"
          name="certificationExpires"
          defaultValue={employee?.certificationExpires ?? ""}
        />
      </Field>
      <Field label="Assigned duties">
        <textarea name="duties" maxLength={2000} defaultValue={employee?.duties} />
      </Field>
      <Field label="Authorized work areas">
        <textarea name="workAreas" maxLength={2000} defaultValue={employee?.workAreas} />
      </Field>
      <Field label="Private manager notes" wide>
        <textarea name="managerNotes" maxLength={2000} defaultValue={employee?.managerNotes} />
      </Field>
    </>
  );
}
