export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Remote Skills</h1>
      <p>Remote-only jobs. Prove your skills on platform-set tasks. Employers hire from the ledger.</p>
      <p>
        Database status: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
