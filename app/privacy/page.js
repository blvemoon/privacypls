import { siteConfig } from '../../lib/siteConfig.js';

export const metadata = { title: 'Privacy policy', description: 'How privacypls.io handles your submission.' };

const ext = { target: '_blank', rel: 'noopener noreferrer' };

export default function PrivacyPage() {
  const site = siteConfig();
  return (
    <article className="prose">
      <h1>Privacy policy</h1>
      <p className="fine">Last updated: {site.privacyLastUpdated}</p>
      <p>
        {site.siteName} is a small independent tool. This page explains, in plain English, what happens to what you submit.
        The short version: <strong>we don&apos;t store what you submit, we don&apos;t use cookies, and we don&apos;t track you across sites or days.</strong>{' '}
        We count page visits anonymously, and the companies that host the site keep their own standard records, both described below.
      </p>

      <h2>What you submit</h2>
      <p>
        When you click Analyze, the text you pasted, or the text of the page at the link you entered, is sent to our app and then to
        Anthropic&apos;s API, where Claude (an AI model) analyzes it. When the result comes back, we send it to your browser and discard the
        text and the link. We don&apos;t save them to a database or a file, and we don&apos;t write them to our logs.
      </p>
      <p>If you enter a link, our app fetches that page itself. The website you link to sees a request from our hosting provider, not from your device.</p>
      <p>Don&apos;t paste anything personal or confidential, like your own account details. The tool is meant for public documents.</p>

      <h2>Anthropic</h2>
      <p>
        Anthropic processes the submitted text to produce the analysis. How Anthropic handles data sent to its API is described in{' '}
        <a href="https://www.anthropic.com/legal/privacy" {...ext}>Anthropic&apos;s privacy policy</a>.
      </p>

      <h2>What we do store</h2>
      <p>
        To keep running costs under control, we keep daily totals of how many analyses ran, how many AI &quot;tokens&quot; they used, and the
        estimated cost, plus a running total of this month&apos;s spending. These totals contain no text, no links, and nothing about who ran them.
      </p>

      <h2>Rate limiting and bot protection</h2>
      <p>
        To stop abuse, each visitor can run one analysis every few minutes. To do this, our app turns your IP address into a scrambled code
        using a secret key that changes every few hours. Only the scrambled code is stored, in our database provider, and it is deleted
        automatically when your waiting period ends. Our app never stores your IP address itself.
      </p>
      <p>
        Before each analysis, your browser solves a small puzzle that is hard for bots to do in bulk (this is ALTCHA, which runs entirely on
        this site; no outside service is contacted). Used puzzle answers are remembered for about 10 minutes so they can&apos;t be reused. There
        is also a hidden form field that people never fill in but some bots do.
      </p>
      {site.passwordRequired ? <p>While the tool is in private testing, an access password is checked with each analysis request. It isn&apos;t stored.</p> : null}

      <h2>Cookies, tracking and analytics</h2>
      <p>This site sets no cookies, and it loads no advertising or third-party trackers.</p>
      <p>
        To see how many people use the site, we use Vercel Web Analytics, which counts page visits without cookies. For each visit it records
        which of our pages was viewed (just the page, like the home page or this one), the site that linked you here, your country, and your
        browser and device type. Instead of a cookie, Vercel tells visits apart using a code calculated from your request, which it discards
        after 24 hours, so visits can&apos;t be linked across days or to other websites. The text and links you submit for analysis are never
        part of what&apos;s counted. See{' '}
        <a href="https://vercel.com/docs/analytics/privacy-policy" {...ext}>Vercel&apos;s analytics privacy details</a>.
      </p>
      <p>If you switch between dark and light mode, your choice is saved in your own browser&apos;s storage so the site remembers it. It is never sent to us.</p>

      <h2>Hosting and database providers</h2>
      <p>
        The site runs on Vercel. Like any hosting company, Vercel automatically records details of each request, including your IP address,
        to deliver and protect the site. We don&apos;t control those records; Vercel handles them under{' '}
        <a href="https://vercel.com/legal/privacy-policy" {...ext}>its privacy policy</a>.
      </p>
      <p>
        Our counters, spending totals, and the scrambled rate-limit codes are kept in a database run by Upstash, under{' '}
        <a href="https://upstash.com/trust/privacy" {...ext}>its privacy policy</a>.
      </p>

      <h2>Links that leave this site</h2>
      {site.donationUrl ? (
        <p>
          The &quot;Support this project&quot; link goes to <a href={site.donationUrl} {...ext}>a donation page</a> on another site. Anything you do
          there is handled by that site and its payment providers under their own policies.
        </p>
      ) : null}
      <p>Links to Anthropic, Vercel, Upstash, and other sites open those sites, which have their own privacy policies.</p>

      <h2>Contact</h2>
      {site.feedback ? (
        <p>
          You can contact me at <a href={site.feedback.href} {...(site.feedback.kind === 'link' ? ext : {})}>{site.feedback.value}</a>. If you
          use a form or email service, that service handles your message under its own policies.
        </p>
      ) : (
        <p>A contact option isn&apos;t available yet. This page will be updated when one is added.</p>
      )}

      <h2>Changes</h2>
      <p>If what the site does changes, this page will be updated first, and the date at the top will change.</p>
    </article>
  );
}
