import { currentUser } from "@/lib/access";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <Shell name={user.name} role={user.role}>
      {children}
    </Shell>
  );
}
