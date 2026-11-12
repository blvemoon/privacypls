import { headers } from 'next/headers';
import { siteConfig } from '../lib/siteConfig.js';
import Analyzer from './components/Analyzer.js';

export default async function HomePage() {
  const nonce = (await headers()).get('x-nonce') || undefined;
  const site = siteConfig();
  return (
    <>
      {site.botCheckEnabled ? (
        <>
          <link rel="stylesheet" href="/vendor/altcha/altcha.css" precedence="default" />
          <script type="module" src="/vendor/altcha/altcha.js" nonce={nonce} async />
        </>
      ) : null}
      <section className="intro">
        <h1>Spot red flags in privacy policies and terms</h1>
        <p className="lede">Enter a link or paste the text. We&apos;ll point out potentially concerning language, quote it exactly, and explain why it might matter.</p>
      </section>
      <Analyzer
        botCheckEnabled={site.botCheckEnabled}
        passwordRequired={site.passwordRequired}
        maxTextChars={site.maxTextChars}
        minTextChars={site.minTextChars}
        rateLimitSeconds={site.rateLimitSeconds}
        donationUrl={site.donationUrl}
      />
    </>
  );
}
