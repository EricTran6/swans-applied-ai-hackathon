// Same 404 page for unknown, expired and revoked share links.
export default function ShareNotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl p-6 text-center">
      <h1 className="text-xl font-semibold">This link has expired or been revoked</h1>
      <p className="mt-2 text-sm text-muted-foreground">Please contact the law firm that sent it and ask for a new link.</p>
    </main>
  );
}
