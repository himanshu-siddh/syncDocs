export default async function DocumentsPage() {
  return (
    <section className="flex flex-1 items-center justify-center p-10">
      <div className="max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
          SyncDocs
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
          Choose a document or create a new one.
        </h2>
        <p className="mt-3 text-zinc-700 dark:text-zinc-200">
          Edits are written locally first, then synchronized in the background when the network is
          available.
        </p>
      </div>
    </section>
  );
}
