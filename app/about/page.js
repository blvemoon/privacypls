import { siteConfig } from '../../lib/siteConfig.js';

export const metadata = { title: 'About' };

export default function AboutPage() {
  const site = siteConfig();
  return (
    <article className="prose">
      <h1>About {site.siteName}</h1>
      <p>
        This is an independent project. It uses AI to flag potentially concerning language in privacy policies and terms. It can make
        mistakes, and it is not legal advice. Text you submit is sent to an AI provider (Anthropic) for analysis and is not stored by this site.
      </p>
      <p>
        It&apos;s meant as a quick first pass for individuals, not a replacement for reading the document, and not for commercial or legal use.
        Every flag includes the exact words it&apos;s based on, so you can check it yourself.
      </p>
      {site.donationUrl ? (
        <p>
          The tool costs money to run (mainly AI analysis). If it&apos;s useful to you, you can{' '}
          <a href={site.donationUrl} target="_blank" rel="noopener noreferrer">chip in to help cover those costs ↗</a>. It&apos;s entirely
          optional, but greatly appreciated! Donations don&apos;t unlock anything, and this isn&apos;t a charity, so donations aren&apos;t tax-deductible.
        </p>
      ) : (
        <p>The tool costs money to run (mainly AI analysis).</p>
      )}
      <h2>How it works</h2>
      <ol>
        <li>You enter a link (we fetch the page) or paste the text.</li>
        <li>Claude, an AI model by Anthropic, checks the text against a list of red-flag rules, like data being sold, AI training on your data, forced arbitration, or hard-to-cancel subscriptions.</li>
        <li>We check every quote against the original text and drop any that don&apos;t match.</li>
        <li>You get an overall risk level, a short summary, and each flag with its quote and explanation.</li>
      </ol>
      <p>See the <a href="/privacy">privacy policy</a> for exactly what happens to your submission.</p>
    </article>
  );
}
