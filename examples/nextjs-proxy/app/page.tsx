export default function HomePage() {
  return (
    <main>
      <h1>Next.js transport proxy</h1>
      <p>
        POST the <code>{"{ provider, formId, to, payload }"}</code> envelope to{" "}
        <code>/api/contact</code>. Server secrets live in <code>.env</code> — see
        the README and <code>docs/transport-proxies.md</code>.
      </p>
    </main>
  );
}