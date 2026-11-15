import { IconSparkles, IconLayout, IconArmchair, IconGauge, IconBug, IconTool } from '@tabler/icons-react';

// One icon per change log category. Icons are inline SVG (no outside requests).
const ICONS = {
  newFeatures: IconSparkles,
  ui: IconLayout,
  qualityOfLife: IconArmchair,
  riskScore: IconGauge,
  bugFixes: IconBug,
  underTheHood: IconTool,
};

// The categorized bullet lists for one version.
export default function ChangelogNotes({ groups }) {
  return groups.map((g) => {
    const Icon = ICONS[g.key];
    return (
      <section key={g.key} className={`cl-group cl-${g.key}`}>
        <h3 className="cl-cat">{Icon ? <Icon size={18} stroke={1.75} aria-hidden="true" /> : null}{g.label}</h3>
        <ul>{g.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </section>
    );
  });
}
