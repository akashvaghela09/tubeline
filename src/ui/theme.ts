// Colour themes for the interactive UI. `theme` is the live palette every component reads;
// applyTheme() swaps it in place and the app re-renders. Every theme paints its own
// background, so text colours never land on an unknown terminal background.

export interface Palette {
  label: string;
  /** Shown in a "More" group in the picker. */
  more?: boolean;
  light: boolean;
  bg: string;
  fg: string;
  dim: string;
  faint: string;
  accent: string;
  accent2: string;
  green: string;
  yellow: string;
  red: string;
  cyan: string;
  cursorBg: string;
  selectedFg: string;
}

export const THEMES = {
  night: {
    label: "Night",
    light: false,
    bg: "#1a1b26",
    fg: "#c0caf5",
    dim: "#7a82a8",
    faint: "#3b4261",
    accent: "#7aa2f7",
    accent2: "#bb9af7",
    green: "#9ece6a",
    yellow: "#e0af68",
    red: "#f7768e",
    cyan: "#7dcfff",
    cursorBg: "#283457",
    selectedFg: "#e0af68",
  },
  day: {
    label: "Day",
    light: true,
    bg: "#f5f6fa",
    fg: "#343b58",
    dim: "#6a6f87",
    faint: "#c8cddf",
    accent: "#2e5fd8",
    accent2: "#7847bd",
    green: "#2f7a32",
    yellow: "#8a5a00",
    red: "#c4314b",
    cyan: "#0f6f8a",
    cursorBg: "#d5daee",
    selectedFg: "#8a5a00",
  },
  gruvbox: {
    label: "Gruvbox",
    light: false,
    bg: "#282828",
    fg: "#ebdbb2",
    dim: "#a89984",
    faint: "#504945",
    accent: "#83a598",
    accent2: "#d3869b",
    green: "#b8bb26",
    yellow: "#fabd2f",
    red: "#fb4934",
    cyan: "#8ec07c",
    cursorBg: "#3c3836",
    selectedFg: "#fabd2f",
  },
  "solarized-light": {
    label: "Solarized Light",
    light: true,
    bg: "#fdf6e3",
    fg: "#3c4a52",
    dim: "#657b83",
    faint: "#d6cfb6",
    accent: "#268bd2",
    accent2: "#6c71c4",
    green: "#5f7d00",
    yellow: "#9a6b00",
    red: "#c8302d",
    cyan: "#1f8a82",
    cursorBg: "#eee8d5",
    selectedFg: "#9a6b00",
  },
  "high-contrast": {
    label: "High contrast",
    light: false,
    bg: "#000000",
    fg: "#ffffff",
    dim: "#c8c8c8",
    faint: "#6c6c6c",
    accent: "#5fd7ff",
    accent2: "#ff87ff",
    green: "#5fff5f",
    yellow: "#ffff00",
    red: "#ff5f5f",
    cyan: "#5fffff",
    cursorBg: "#005f87",
    selectedFg: "#ffff00",
  },
  "catppuccin-mocha": {
    label: "Catppuccin Mocha",
    more: true,
    light: false,
    bg: "#1e1e2e",
    fg: "#cdd6f4",
    dim: "#9399b2",
    faint: "#45475a",
    accent: "#89b4fa",
    accent2: "#cba6f7",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    red: "#f38ba8",
    cyan: "#89dceb",
    cursorBg: "#313244",
    selectedFg: "#fab387",
  },
  nord: {
    label: "Nord",
    more: true,
    light: false,
    bg: "#2e3440",
    fg: "#e5e9f0",
    dim: "#a3abbe",
    faint: "#4c566a",
    accent: "#88c0d0",
    accent2: "#b48ead",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    red: "#bf616a",
    cyan: "#8fbcbb",
    cursorBg: "#3b4252",
    selectedFg: "#d08770",
  },
  dracula: {
    label: "Dracula",
    more: true,
    light: false,
    bg: "#282a36",
    fg: "#f8f8f2",
    dim: "#a3a8c3",
    faint: "#44475a",
    accent: "#bd93f9",
    accent2: "#ff79c6",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    red: "#ff5555",
    cyan: "#8be9fd",
    cursorBg: "#44475a",
    selectedFg: "#ffb86c",
  },
  "github-light": {
    label: "GitHub Light",
    more: true,
    light: true,
    bg: "#ffffff",
    fg: "#1f2328",
    dim: "#59636e",
    faint: "#d1d9e0",
    accent: "#0969da",
    accent2: "#8250df",
    green: "#1a7f37",
    yellow: "#9a6700",
    red: "#cf222e",
    cyan: "#1b7c83",
    cursorBg: "#ddf4ff",
    selectedFg: "#bc4c00",
  },
} satisfies Record<string, Palette>;

export type ThemeName = keyof typeof THEMES;
/** What the user picks: a theme, or "auto" (Night/Day by the terminal's background). */
export type ThemeChoice = ThemeName | "auto";
export const DEFAULT_THEME: ThemeChoice = "auto";

const LEGACY: Record<string, ThemeName> = { "tokyo-night": "night", "gruvbox-dark": "gruvbox" };

export function normalizeTheme(name: unknown): ThemeChoice {
  if (name === "auto") return "auto";
  if (typeof name === "string" && name in THEMES) return name as ThemeName;
  if (typeof name === "string" && name in LEGACY) return LEGACY[name] as ThemeName;
  return DEFAULT_THEME;
}

/** Resolve "auto" using the terminal's reported background (null = unknown → Night). */
export function resolveTheme(choice: ThemeChoice, terminal: "light" | "dark" | null): ThemeName {
  if (choice !== "auto") return choice;
  if (process.env.NO_COLOR) return "high-contrast";
  return terminal === "light" ? "day" : "night";
}

export const theme: Palette = { ...THEMES.night };

export function applyTheme(name: ThemeName) {
  Object.assign(theme, { more: undefined }, THEMES[name]);
}
