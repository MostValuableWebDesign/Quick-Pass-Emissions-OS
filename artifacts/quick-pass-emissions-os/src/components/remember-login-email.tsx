"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

const REMEMBERED_EMAIL_KEY = "quick-pass:remembered-login-email";

function saveRememberedEmail(value: string) {
  try {
    if (value) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, value);
    else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Login remains usable when browser storage is disabled.
  }
}

export function RememberLoginEmail({ children }: { children: ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      const input = inputRef.current;
      if (savedEmail && input && !input.value) {
        input.value = savedEmail;
        if (checkboxRef.current) checkboxRef.current.checked = true;
      }
    } catch {
      // Login remains usable when browser storage is disabled.
    }
  }, []);

  return (
    <>
      <label className="field">
        <span>Email address</span>
        <input
          ref={inputRef}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="name@company.com"
          spellCheck={false}
          autoCapitalize="none"
          maxLength={254}
          onChange={(event) => {
            const nextEmail = event.currentTarget.value;
            if (checkboxRef.current?.checked) saveRememberedEmail(nextEmail.trim());
          }}
          required
        />
      </label>
      {children}
      <label className="login-remember-email">
        <input
          ref={checkboxRef}
          type="checkbox"
          onChange={(event) => {
            const nextEmail = inputRef.current?.value.trim() ?? "";
            saveRememberedEmail(event.currentTarget.checked ? nextEmail : "");
          }}
        />
        <span>Remember email on this device</span>
      </label>
    </>
  );
}
