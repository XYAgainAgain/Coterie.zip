import { route } from 'preact-router';

const MOCK_CHARACTERS = [
  { id: 'johnny-fangs', name: 'Johnny Fangs', clan: 'Banu Haqim', predator: 'Consensualist' },
  { id: 'silk', name: 'Silk', clan: 'Nosferatu', predator: 'Sandman' },
];

export function CharacterList() {
  return (
    <div class="vamp-character-list">
      <h2 style={{ fontFamily: 'var(--v-font-display)', color: 'var(--v-text-accent)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.6rem' }}>
        Your Kindred
      </h2>

      {MOCK_CHARACTERS.map(c => (
        <div
          class="vamp-character-list__card"
          key={c.id}
          onClick={() => route(`/vamp/${c.id}`)}
        >
          <div>
            <div class="vamp-character-list__name">{c.name}</div>
            <div class="vamp-character-list__clan">{c.clan} {c.predator}</div>
          </div>
        </div>
      ))}

      <div
        class="vamp-character-list__new"
        onClick={() => route('/vamp/new')}
      >
        + Create New Kindred
      </div>
    </div>
  );
}
