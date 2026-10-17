"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeSetting() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const dark = mounted && resolvedTheme === "dark";

  return (
    <section className="card card-body">
      <div className="card-heading">
        <div>
          <h2>Appearance</h2>
          <p className="muted">Choose the theme used across the app.</p>
        </div>
      </div>
      <div className="settings-appearance-row">
        <p>{mounted ? (dark ? "Dark theme" : "Light theme") : "Theme preference"}</p>
        <Button
          type="button"
          variant="outline"
          disabled={!mounted}
          aria-pressed={dark}
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {mounted && dark ? (
            <Sun size={16} aria-hidden="true" />
          ) : (
            <Moon size={16} aria-hidden="true" />
          )}
          {mounted ? `Switch to ${dark ? "light" : "dark"} theme` : "Loading theme preference"}
        </Button>
      </div>
    </section>
  );
}
