"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Secret code: type "1234" to go back to the app
const SECRET_CODE = "1234";

export default function SafePage() {
  const router = useRouter();
  const [display, setDisplay] = useState("0");
  const [typedCode, setTypedCode] = useState("");
  const [expression, setExpression] = useState("");
  const [justEvaluated, setJustEvaluated] = useState(false);

  // Listen for secret code to return to app
  useEffect(() => {
    if (typedCode.endsWith(SECRET_CODE)) {
      router.push("/chat");
      setTypedCode("");
    }
  }, [typedCode, router]);

  const handleInput = (val: string) => {
    setTypedCode((prev) => (prev + val).slice(-10));

    if (justEvaluated && !isNaN(Number(val))) {
      setDisplay(val);
      setExpression("");
      setJustEvaluated(false);
      return;
    }

    if (justEvaluated) {
      setJustEvaluated(false);
    }

    if (val === "C") {
      setDisplay("0");
      setExpression("");
      setJustEvaluated(false);
      return;
    }

    if (val === "⌫") {
      setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
      return;
    }

    if (val === "=") {
      try {
        // Safe eval using Function
        const expr = (expression + display).replace(/×/g, "*").replace(/÷/g, "/");
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${expr})`)();
        const formatted =
          typeof result === "number"
            ? parseFloat(result.toFixed(8)).toString()
            : "Error";
        setDisplay(formatted);
        setExpression("");
        setJustEvaluated(true);
      } catch {
        setDisplay("Error");
        setExpression("");
      }
      return;
    }

    if (["+", "-", "×", "÷", "%"].includes(val)) {
      setExpression(expression + display + val);
      setDisplay("0");
      return;
    }

    if (val === ".") {
      if (!display.includes(".")) {
        setDisplay(display + ".");
      }
      return;
    }

    // Number
    setDisplay(display === "0" ? val : display + val);
  };

  const buttons = [
    ["C", "⌫", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"],
    ["0", ".", "="],
  ];

  const isOperator = (val: string) => ["÷", "×", "-", "+", "="].includes(val);
  const isDanger = (val: string) => val === "C";

  return (
    <div className="calc-wrapper">
      <div className="calc-container">
        {/* Display */}
        <div className="calc-display">
          <div className="calc-expression">{expression || " "}</div>
          <div className="calc-result">{display}</div>
        </div>

        {/* Buttons */}
        <div className="calc-grid">
          {buttons.map((row, ri) =>
            row.map((btn) => (
              <button
                key={`${ri}-${btn}`}
                className={`calc-btn ${
                  isOperator(btn)
                    ? "calc-btn--op"
                    : isDanger(btn)
                    ? "calc-btn--clear"
                    : ""
                } ${btn === "0" ? "calc-btn--zero" : ""}`}
                onClick={() => handleInput(btn)}
              >
                {btn}
              </button>
            ))
          )}
        </div>

        {/* Hidden hint */}
        <p className="calc-hint">Calculator</p>
      </div>
    </div>
  );
}
