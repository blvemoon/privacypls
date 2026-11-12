'use client';
// Vercel Web Analytics: cookie-free page-view counts (see the privacy page).
// The script is served from this site's own domain (/_vercel/insights/...).
// Before anything is sent, everything after "?" or "#" is removed from the page
// address, so nothing but the plain page path (like "/" or "/privacy") is ever
// recorded. Submitted text and links are never in a page address: the analyzer
// sends them in the body of a separate request, which isn't a page view.
import { Analytics } from '@vercel/analytics/next';

function stripQuery(event) {
  return { ...event, url: event.url.split(/[?#]/)[0] };
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={stripQuery} />;
}
