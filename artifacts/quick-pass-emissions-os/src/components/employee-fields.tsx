import type { Employee, User } from "@prisma/client";
import { Field } from "./action-form";
import { ContactAddressFields } from "./contact-address-fields";

export function EmployeeFields({ employee }: { employee?: Employee & { user: User } }) {
  return (
    <>
      <Field label="Name">
        <input name="name" autoComplete="name" required maxLength={160} defaultValue={employee?.user.name} />
      </Field>
      <Field label="Phone">
        <input name="phone" type="tel" autoComplete="tel" maxLength={50} defaultValue={employee?.phone} />
      </Field>
      <Field label="Role">
        <input name="jobRole" required maxLength={160} placeholder="Inspector"
          defaultValue={employee?.jobRole || "Inspector"} />
      </Field>
      <ContactAddressFields value={employee} />
      <Field label="Certification expiry (optional)">
        <input type="date" name="certificationExpires" defaultValue={employee?.certificationExpires ?? ""} />
      </Field>
    </>
  );
}
