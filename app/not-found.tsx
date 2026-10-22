import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ fontSize: 40 }} aria-hidden="true">
        🐤
      </div>
      <h1 style={{ fontSize: 20 }}>Page not found</h1>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        This URL doesn&apos;t exist. Main chat lives at&nbsp;
        <code>/</code>, learning at <code>/learn</code>, settings at{" "}
        <code>/settings</code>.
      </p>
      <Link
        href="/"
        style={{
          textDecoration: "none",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 14,
        }}
      >
        Back to chat
      </Link>
    </main>
  );
}
