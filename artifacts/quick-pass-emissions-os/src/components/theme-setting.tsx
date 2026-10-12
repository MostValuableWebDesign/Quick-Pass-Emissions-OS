"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

export function ThemeSetting() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <section className="card card-body">
      <div className="card-heading">
        <div>
          <h2>Appearance</h2>
          <p className="muted">Choose the theme used across the app.</p>
        </div>
      </div>
      <div className="settings-appearance-row">
        <p>{dark ? "Dark theme" : "Light theme"}</p>
        <Button
          type="button"
          variant="outline"
          aria-pressed={dark}
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          Switch to {dark ? "light" : "dark"} theme
        </Button>
      </div>
    </section>
  );
}
