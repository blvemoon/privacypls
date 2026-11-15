'use client';
import { useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import ChangelogNotes from './ChangelogNotes.js';

const BATCH = 5;

// Older versions: hidden until "Load more", then shown as one-line rows
// (version, date, summary) that expand to the full notes.
export default function ChangelogOlder({ entries }) {
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(() => new Set());

  if (entries.length === 0) return null;

  function toggle(version) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  }

  return (
    <>
      {shown > 0 ? (
        <ol className="cl-older" aria-label="Older versions">
          {entries.slice(0, shown).map((e) => {
            const isOpen = open.has(e.version);
            const notesId = `cl-notes-${e.version.replaceAll('.', '-')}`;
            return (
              <li key={e.version} className={`cl-entry${isOpen ? ' is-open' : ''}`}>
                <button type="button" className="cl-row" aria-expanded={isOpen} aria-controls={notesId} onClick={() => toggle(e.version)}>
                  <IconChevronRight className="cl-chev" size={18} stroke={2} aria-hidden="true" />
                  <span className="cl-row-version">Version {e.version}</span>
                  <span className="cl-date">{e.dateLabel}</span>
                  <span className="cl-summary">{e.summary}</span>
                </button>
                <div id={notesId} className="cl-notes cl-notes-indented" hidden={!isOpen}>
                  <ChangelogNotes groups={e.groups} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {shown < entries.length ? (
        <button type="button" className="cl-more" onClick={() => setShown((n) => Math.min(n + BATCH, entries.length))}>
          Load more
        </button>
      ) : null}
    </>
  );
}
