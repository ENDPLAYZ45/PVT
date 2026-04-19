"use client";

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', sans-serif",
      color: "#fff",
      textAlign: "center",
      padding: "2rem",
    }}>
      <div style={{
        width: 80,
        height: 80,
        background: "#facc15",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "2rem",
        marginBottom: "1.5rem",
      }}>
        🔒
      </div>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        You&apos;re offline
      </h1>
      <p style={{ color: "#888", fontSize: "1rem", maxWidth: 300, lineHeight: 1.6 }}>
        PVT needs a connection to decrypt and send messages. Please check your internet and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "2rem",
          padding: "0.75rem 2rem",
          background: "#facc15",
          color: "#0a0a0a",
          border: "none",
          borderRadius: 8,
          fontWeight: 700,
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
