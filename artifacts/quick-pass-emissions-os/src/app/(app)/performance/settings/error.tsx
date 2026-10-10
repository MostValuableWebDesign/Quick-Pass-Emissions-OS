"use client";
import { ErrorPanel } from "@/components/phase5";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorPanel
      message="Unable to load this page. Check your connection and permissions."
      reset={reset}
    />
  );
}
