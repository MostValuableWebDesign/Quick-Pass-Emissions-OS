import type { Employee, User } from "@prisma/client";
import { ContactAddressFields } from "./contact-address-fields";
import { ContactPhoneField } from "./contact-phone-field";

export function EmployeeFields({ employee }: { employee?: Employee & { user: User } }) {
  return (
    <>
      <Field label="Name">
        <input
          name="name"
          autoComplete="name"
          required
          maxLength={160}
          defaultValue={employee?.user.name}
        />
      </Field>
      <ContactPhoneField value={employee?.phone} />
      <Field label="Role">
        <select name="jobRole" required defaultValue={employee?.jobRole || "Inspector"}>
          <option value="Owner">Owner</option>
          <option value="Inspector">Inspector</option>
          {employee?.jobRole && !["Owner", "Inspector"].includes(employee.jobRole) && (
            <option value={employee.jobRole}>{employee.jobRole}</option>
          )}
        </select>
      </Field>
      <ContactAddressFields value={employee} />
      <Field label="Certification expiry (optional)">
        <input
          type="date"
          name="certificationExpires"
          defaultValue={employee?.certificationExpires ?? ""}
        />
      </Field>
    </>
  );
}
