"use client";

import { createContext } from "react";

export const DirectoryAddDialogContext = createContext<(() => void) | null>(null);
