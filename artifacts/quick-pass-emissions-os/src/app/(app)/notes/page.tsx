import { currentUser } from "@/lib/access";
import { personalWorkspace } from "@/modules/personal/service";
import { PersonalWorkspace } from "@/components/personal-workspace";
export default async function NotesPage() {
  const user = await currentUser();
  return <PersonalWorkspace initialData={await personalWorkspace(user.id)} />;
}
