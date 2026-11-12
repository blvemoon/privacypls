import { notFound } from 'next/navigation';
import { siteConfig } from '../../lib/siteConfig.js';

export const metadata = { title: 'Feedback' };

// Hidden (404) until FEEDBACK_CONTACT is set.
export default function FeedbackPage() {
  const f = siteConfig().feedback;
  if (!f) notFound();
  const ext = f.kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <article className="prose">
      <h1>Feedback</h1>
      <p>Found a wrong flag, a missed one, or a bug? I&apos;d like to hear about it.</p>
      <p><a className="button-link" href={f.href} {...ext}>{f.kind === 'email' ? `Email ${f.value}` : 'Open the feedback form ↗'}</a></p>
      <p className="fine">Please don&apos;t include personal information you don&apos;t want to share. See the <a href="/privacy">privacy policy</a>.</p>
    </article>
  );
}
