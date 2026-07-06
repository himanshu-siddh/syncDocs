import { DocumentSidebar } from "@/components/documents/document-sidebar";
import { listDocumentsForUserOrEmpty } from "@/server/documents";
import { requireUser } from "@/server/http";

export default async function DocumentsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const documents = await listDocumentsForUserOrEmpty(user.id);

  return (
    <main className="flex h-screen bg-zinc-50 dark:bg-zinc-700">
      <DocumentSidebar documents={documents} userName={user.name} />
      {children}
    </main>
  );
}
