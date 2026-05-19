"use client";

const SKELETONS = [
  { side: "received", width: "short" },
  { side: "sent",     width: "medium" },
  { side: "received", width: "long" },
  { side: "sent",     width: "short" },
  { side: "received", width: "medium" },
  { side: "sent",     width: "long" },
] as const;

export default function SkeletonMessages() {
  return (
    <div className="skeleton-messages">
      {SKELETONS.map((s, i) => (
        <div key={i} className={`skeleton-row skeleton-row--${s.side}`}>
          <div className={`skeleton skeleton-msg skeleton-msg--${s.width}`} />
        </div>
      ))}
    </div>
  );
}
