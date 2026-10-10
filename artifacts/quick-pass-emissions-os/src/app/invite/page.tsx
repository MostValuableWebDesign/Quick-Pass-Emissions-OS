"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { acceptInvite } from "@/app/actions";
import { ActionForm, Field } from "@/components/action-form";
export default function Invite() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.value = window.location.hash.slice(1);
    window.history.replaceState(null, "", "/invite");
  }, []);
  return (
    <main className="invite-page">
      <section className="card card-body">
        <p className="eyebrow">QUICK PASS BUSINESS OS</p>
        <h1>Your workspace is ready.</h1>
        <p className="muted">
          Set a password of at least 12 characters to activate your invited account.
        </p>
        <ActionForm action={acceptInvite} submit="Activate account">
          <input type="hidden" name="token" ref={input} />
          <Field label="New password" wide>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </Field>
        </ActionForm>
        <Link className="text-link space-top" href="/login">
          Continue to sign in →
        </Link>
      </section>
    </main>
  );
}
