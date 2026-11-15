import { getChangelog } from '../../lib/changelog.js';
import ChangelogNotes from '../components/ChangelogNotes.js';
import ChangelogOlder from '../components/ChangelogOlder.js';

export const metadata = { title: 'Change log' };

export default function ChangelogPage() {
  const [latest, ...older] = getChangelog();
  return (
    <article className="changelog">
      <h1>Change log</h1>
      <p className="cl-intro">Every update to privacypls.io, newest first.</p>

      <section className="cl-entry cl-latest" aria-labelledby="cl-latest-heading">
        <div className="cl-head">
          <h2 id="cl-latest-heading">Version {latest.version}</h2>
          <span className="cl-badge">Latest</span>
          <span className="cl-date">{latest.dateLabel}</span>
        </div>
        <div className="cl-notes">
          <ChangelogNotes groups={latest.groups} />
        </div>
      </section>

      <ChangelogOlder entries={older} />
    </article>
  );
}
