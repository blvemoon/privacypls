import { headers } from 'next/headers';
import { siteConfig } from '../lib/siteConfig.js';
import SiteAnalytics from './components/SiteAnalytics.js';
import './globals.css';

export const metadata = {
  title: { default: 'privacypls.io', template: '%s · privacypls.io' },
  description: 'Paste a privacy policy or terms of service, or enter a link, and see potential red flags with exact quotes.',
  referrer: 'no-referrer',
  icons: { icon: '/favicon.svg' },
};

export const viewport = { colorScheme: 'dark light' };

export default async function RootLayout({ children }) {
  // Calling headers() makes every page render per request, which is needed for
  // the security nonce (see proxy.js).
  const nonce = (await headers()).get('x-nonce') || undefined;
  const site = siteConfig();
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark choice before the page draws. */}
        <script src="/js/theme.js" nonce={nonce} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="wrap header-row">
            <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">◆</span> {site.siteName}</a>
            <button type="button" className="theme-toggle" id="theme-toggle" aria-label="Switch to light mode" suppressHydrationWarning>Light mode</button>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-row">
            <nav aria-label="Footer">
              <a href="/privacy">Privacy policy</a>
              <a href="/about">About</a>
              {site.feedback ? <a href="/feedback">Feedback</a> : null}
              {site.donationUrl ? <a href={site.donationUrl} target="_blank" rel="noopener noreferrer">Support this project ↗</a> : null}
            </nav>
            <p className="fine">Results are AI-generated potential flags, not legal advice.</p>
          </div>
        </footer>
        <SiteAnalytics />
      </body>
    </html>
  );
}
