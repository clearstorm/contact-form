/**
 * Page shell for the react-demo — header with route nav, main slot and
 * footer. The React equivalent of astro-demo's `DemoLayout.astro`: every page
 * renders inside this so all routes share the same chrome.
 */
import type { ReactNode } from "react";
import { NavLink } from "react-router";

const links = [
  { to: "/", label: "Home" },
  { to: "/field-types", label: "Field types" },
  { to: "/conditional", label: "Conditional fields" },
  { to: "/wizard", label: "Wizard" },
  { to: "/theming", label: "Theming" },
  { to: "/mailers", label: "Mailers" },
  { to: "/vanilla", label: "Vanilla JS" },
];

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="demo-header">
        <div className="demo-shell demo-header__inner">
          <span className="demo-brand">@clearstorm/contact-form · React demo</span>
          <nav className="demo-nav" aria-label="Demo pages">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="demo-shell demo-main">
        <p className="demo-kicker">{title}</p>
        {children}
      </main>

      <footer className="demo-footer">
        <div className="demo-shell">
          <p>
            Demo app inside the package repo — the form engine is linked live
            via <code>file:../..</code> (a <code>file:</code> dependency), so
            editing the package's source hot-reloads these pages. The json-mailer
            forms post to <code>http://localhost:8787</code> — start it with{" "}
            <code>npm run demo:api</code>.
          </p>
        </div>
      </footer>
    </>
  );
}