// The package styles are imported exactly once (they are never auto-injected).
// The `rf-*` classes come from the same stylesheet every binding shares.
import "@clearstorm/contact-form/styles.css";

import { BrowserRouter, Route, Routes } from "react-router";
import { HomePage } from "./pages/HomePage";
import { FieldTypesPage } from "./pages/FieldTypesPage";
import { ConditionalPage } from "./pages/ConditionalPage";
import { WizardPage } from "./pages/WizardPage";
import { MailersPage } from "./pages/MailersPage";
import { ThemingPage } from "./pages/ThemingPage";
import { VanillaPage } from "./pages/VanillaPage";

/**
 * Seven routes — the same paths as the Astro demo, each rendering the named
 * forms from `examples/specs/*.json` with the uncontrolled `<ContactForm />`
 * (the shared engine owns validation, conditional visibility, wizard state and
 * submission). The URL parity means the Astro and React demos are drop-in
 * swappable.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/field-types" element={<FieldTypesPage />} />
        <Route path="/conditional" element={<ConditionalPage />} />
        <Route path="/wizard" element={<WizardPage />} />
        <Route path="/mailers" element={<MailersPage />} />
        <Route path="/theming" element={<ThemingPage />} />
        <Route path="/vanilla" element={<VanillaPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}