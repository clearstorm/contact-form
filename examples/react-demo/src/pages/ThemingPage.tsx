import { PageShell } from "../components/PageShell";
import { FormDemonstration } from "../components/FormDemonstration";
import themingSpec from "../../../specs/theming.json";
import { getForm, type NamedForms } from "../lib/forms";

const light = getForm(themingSpec as NamedForms, "Light — default + brand accent");
const dark = getForm(themingSpec as NamedForms, "Dark — full override");
const pageShellTitle = "--rf-* custom properties";

const darkThemeCss = `.theme-dark .rf-form {
  --rf-field-bg:  #1b1512;
  --rf-field-border: #3a302b;
  --rf-field-text:  #faf5ee;
  --rf-focus:     #f0bd79;
  --rf-muted:     #b9ada2;
  --rf-label-color: #faf5ee;
  --rf-submit-bg:   #c46f48;
  --rf-submit-text: #120e0c;
  --rf-success:   #16a34a;
  --rf-success-text: #bbf7d0;
  --rf-danger:    #e56b65;
  --rf-color-scheme: dark;
  /* spacing is themeable too */
  --rf-field-min-height: 3rem;
  --rf-submit-min-height: 3rem;
}`;

export function ThemingPage() {
  return (
    <PageShell title={pageShellTitle}>
      <h1>Theming, without touching markup</h1>
      <p className="lead">
        The two forms below use the <em>same</em> component and spec shape. The only
        difference is a CSS scope: the light side uses the shipped default theme (plus
        one accent override), the dark side redeclares the <code>--rf-*</code>{" "}
        variables. No component props, no Tailwind, no markup changes.
      </p>

      <h2>Light — default theme + a brand accent</h2>
      <div className="demo-card theme-light">
        <FormDemonstration form={light} />
      </div>

      <h2>Dark — full override block</h2>
      <div className="demo-card theme-dark">
        <FormDemonstration form={dark} />
      </div>

      <h2>The whole dark theme</h2>
      <pre>{darkThemeCss}</pre>
    </PageShell>
  );
}