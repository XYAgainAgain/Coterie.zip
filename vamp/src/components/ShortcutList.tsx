type Cap = { kbd: string } | { sep: string };
interface Entry { caps: Cap[]; desc: string; }
interface Group { label: string; rows: Entry[][]; }

const K = (kbd: string): Cap => ({ kbd });
const S = (sep: string): Cap => ({ sep });

const GROUPS: Group[] = [
  { label: 'Tabs', rows: [
    [{ caps: [K('1'), K('2'), K('3'), K('4'), K('5')], desc: 'Content tabs' }],
    [{ caps: [K('Shift'), S('+'), K('1'), S('–'), K('5')], desc: 'Split pane' }],
    [{ caps: [K('C'), K('V'), K('X'), K('B'), K('H')], desc: 'Right Panels' }],
  ] },
  { label: 'Rolls', rows: [
    [{ caps: [K('Ctrl')], desc: '+ click → Advantage' }],
    [{ caps: [K('Alt')], desc: '+ click → Disadvantage' }],
    [{ caps: [K('Shift')], desc: '+ click → Roll without modifiers' }],
  ] },
  { label: 'Actions', rows: [
    [{ caps: [K('S')], desc: 'Stake' }, { caps: [K('P')], desc: 'Portrait' }, { caps: [K('Y')], desc: 'Split view' }],
    [{ caps: [K('A'), S('/'), K('D')], desc: 'Adv/Dis' }, { caps: [K('T')], desc: 'Theme' }],
  ] },
  { label: 'Text', rows: [
    [{ caps: [K('−'), K('+'), K('0')], desc: 'Text size' }, { caps: [K('F')], desc: 'Font' }],
  ] },
];

export function ShortcutList() {
  return (
    <div class="vamp-shortcuts">
      {GROUPS.map(g => (
        <div class="vamp-shortcuts__group" key={g.label}>
          <div class="vamp-shortcuts__group-label">{g.label}</div>
          {g.rows.map((row, ri) => (
            <div class="vamp-shortcuts__row" key={ri}>
              {row.map((entry, ei) => (
                <span class="vamp-shortcuts__entry" key={ei}>
                  <span class="vamp-shortcuts__keys">
                    {entry.caps.map((c, j) => 'kbd' in c
                      ? <kbd class="vamp-kbd" key={j}>{c.kbd}</kbd>
                      : <span class="vamp-shortcuts__sep" key={j}>{c.sep}</span>)}
                  </span>
                  <span class="vamp-shortcuts__desc">{entry.desc}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
      <p class="vamp-shortcuts__note">Rebinding isn't available yet; it's coming in a later update.</p>
    </div>
  );
}
