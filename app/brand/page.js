import Logo from '../components/Logo.js';

export const metadata = {
  title: 'press kit',
  description: 'The privacypls.io logo, colors, and fonts, plus a few lines about what the site does.',
};

// Brand colors. Keep in sync with the brand guidelines and the theme colors in globals.css.
const PALETTES = [
  {
    mode: 'dark',
    title: 'dark mode',
    colors: [
      { name: 'Logo teal', use: 'Logo and accents', hex: '#5EEAD4', rgb: '94, 234, 212', cmyk: '60, 0, 9, 8' },
      { name: 'Background', use: 'Site background and holding shape', hex: '#0B1016', rgb: '11, 16, 22', cmyk: '50, 27, 0, 91' },
      { name: 'Text', use: 'Main text', hex: '#E6EDF3', rgb: '230, 237, 243', cmyk: '5, 2, 0, 5' },
    ],
  },
  {
    mode: 'light',
    title: 'light mode',
    colors: [
      { name: 'Logo teal', use: 'Logo and accents', hex: '#0F766E', rgb: '15, 118, 110', cmyk: '87, 0, 7, 54' },
      { name: 'Background', use: 'Site background and holding shape', hex: '#F6F8FA', rgb: '246, 248, 250', cmyk: '2, 1, 0, 2' },
      { name: 'Text', use: 'Main text', hex: '#111A24', rgb: '17, 26, 36', cmyk: '53, 28, 0, 86' },
    ],
  },
];

export default function BrandPage() {
  return (
    <article className="pk">
      <h1>press kit</h1>
      <div className="prose pk-intro">
        <p>
          privacypls.io reads privacy policies and terms of service so you don&apos;t have to slog through every word. Paste one in or drop
          a link, and it points out the sketchy bits, each with the exact quote it&apos;s based on.
        </p>
        <p>
          It&apos;s a small independent project. It runs on AI, so it can get things wrong, and it&apos;s not legal advice. Writing about
          us? Everything you need is right here: the logo, the colors, and the fonts.
        </p>
      </div>

      <section className="pk-card" aria-labelledby="pk-logo">
        <h2 id="pk-logo">logo</h2>
        <p className="pk-note">
          The crescent shield. The name is always written in lowercase: privacypls.io.
        </p>
        <div className="pk-logos">
          <figure className="pk-fig">
            <Logo id="pk-dark-lg" size={140} holding className="pk-mark-dark" holdingClass="pk-hold-dark" title="privacypls.io logo, dark mode" />
            <figcaption>Dark mode, with holding shape</figcaption>
          </figure>
          <figure className="pk-fig">
            <Logo id="pk-light-lg" size={140} holding className="pk-mark-light" holdingClass="pk-hold-light" title="privacypls.io logo, light mode" />
            <figcaption>Light mode, with holding shape</figcaption>
          </figure>
        </div>
        <div className="pk-sizes">
          <figure className="pk-fig pk-fig-sm">
            <Logo id="pk-dark-20" size={20} holding className="pk-mark-dark" holdingClass="pk-hold-dark" />
            <figcaption>20 px, dark</figcaption>
          </figure>
          <figure className="pk-fig pk-fig-sm">
            <Logo id="pk-dark-40" size={40} holding className="pk-mark-dark" holdingClass="pk-hold-dark" />
            <figcaption>40 px, dark</figcaption>
          </figure>
          <figure className="pk-fig pk-fig-sm">
            <Logo id="pk-light-20" size={20} holding className="pk-mark-light" holdingClass="pk-hold-light" />
            <figcaption>20 px, light</figcaption>
          </figure>
          <figure className="pk-fig pk-fig-sm">
            <Logo id="pk-light-40" size={40} holding className="pk-mark-light" holdingClass="pk-hold-light" />
            <figcaption>40 px, light</figcaption>
          </figure>
        </div>
        <div className="pk-headers">
          <div className="pk-header pk-header-dark">
            <Logo id="pk-head-dark" size={26} className="pk-mark-dark" />
            <span>privacypls.io</span>
          </div>
          <div className="pk-header pk-header-light">
            <Logo id="pk-head-light" size={26} className="pk-mark-light" />
            <span>privacypls.io</span>
          </div>
        </div>
        <p className="pk-note">
          <strong>Holding shape:</strong> the rounded square behind the logo. It lets the logo sit on any background color, and it always
          uses the site background color for that mode. In the site header, the logo goes without it.
        </p>
      </section>

      <section aria-labelledby="pk-colors">
        <h2 id="pk-colors">colors</h2>
        <div className="pk-palettes">
          {PALETTES.map((p) => (
            <div key={p.mode} className={`pk-palette pk-palette-${p.mode}`}>
              <h3>{p.title}</h3>
              <ul>
                {p.colors.map((c) => (
                  <li key={c.hex}>
                    <span className={`pk-swatch pk-swatch-${c.hex.slice(1).toLowerCase()}`} aria-hidden="true" />
                    <span className="pk-color">
                      <strong>{c.name}</strong>
                      <span className="pk-use">{c.use}</span>
                      <code>HEX {c.hex}</code>
                      <code>RGB {c.rgb}</code>
                      <code>CMYK {c.cmyk}</code>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="pk-note">CMYK values are straight conversions from the screen colors, so check them with your printer before printing.</p>
      </section>

      <section aria-labelledby="pk-type">
        <h2 id="pk-type">fonts</h2>
        <div className="prose">
          <p>
            No special font: the site uses your device&apos;s own system font (San Francisco on Apple devices, Segoe UI on Windows,
            Roboto on Android). Body text is regular, buttons and labels are semibold, and headings and the name are bold.
          </p>
          <p className="pk-serif">Quotes from analyzed policies use a serif, like this.</p>
          <pre className="pk-stack">system-ui, -apple-system, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, sans-serif</pre>
        </div>
      </section>
    </article>
  );
}
