export default function ChatEmptyPage() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">💬</div>
      <h2>Your Conversations are Private</h2>
      <p>
        Select a conversation from the sidebar or search for users to start an
        end-to-end encrypted chat. The server never sees your messages.
      </p>
      <div
        className="encryption-badge"
        style={{ marginTop: 8 }}
      >
        <span className="lock-icon">🔒</span>
        <span>E2E Encrypted</span>
      </div>
    </div>
  );
}
