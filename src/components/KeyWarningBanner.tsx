"use client";

import { useState, useEffect } from "react";

export default function KeyWarningBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isFirstLogin = localStorage.getItem("pvt_first_login");
    const dismissed = localStorage.getItem("pvt_key_warning_dismissed");
    if (isFirstLogin && !dismissed) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem("pvt_key_warning_dismissed", "true");
    localStorage.removeItem("pvt_first_login");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="key-warning">
      <div className="key-warning-text">
        <span>⚠️</span>
        <span>
          Your messages are device-bound. Clearing browser data deletes your
          encryption key permanently.
        </span>
      </div>
      <button className="key-warning-close" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
