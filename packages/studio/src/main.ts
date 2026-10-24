import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles.css";

import { loadFonts } from "./fonts";
import { startRenderMode } from "./render-mode";
import { startStudio } from "./studio";

const q = new URLSearchParams(location.search);
// The studio redraws every animation frame, so it picks the faces up as they arrive.
void loadFonts();
if (q.has("render")) startRenderMode();
else startStudio(q.has("demo") || location.protocol === "file:" || !!(window as { CUTLOUPE_DEMO?: boolean }).CUTLOUPE_DEMO);
