# CLAUDE.md

## Projet

Backoffice gamemaster pour escape game interactif. Gère les sessions de jeu et la communication temps réel avec les mini-jeux. Les inscriptions sont gérées par un service externe.

## Contexte technique

- **Réseau** : Backoffice tourne en local, ports ouverts. Les mini-jeux (sur des PC séparés) s'y connectent directement.
- **Inscriptions** : Service externe en ligne, le backoffice fetch les équipes via API.
- **Temps réel** : Socket.IO pour communication bidirectionnelle avec les mini-jeux.

## Stack

| Couche | Techno                           |
| ------ | -------------------------------- |
| Back   | Express + Socket.IO + TypeScript |
| Front  | React + Vite + TypeScript        |
| DB     | SQLite (better-sqlite3)          |
| Upload | Multer                           |

## Structure

```
escape-backoffice/
├── server/
│   ├── index.ts              # Entry Express + Socket.IO
│   ├── db/
│   │   ├── index.ts          # Init SQLite
│   │   └── schema.sql        # Tables
│   ├── routes/
│   │   ├── inscription.ts    # Proxy GET vers API externe
│   │   └── sessions.ts       # Sessions de jeu
│   └── socket/
│       └── gamemaster.ts     # Logique temps réel
├── client/                   # React dashboard
├── external/                 # Projets PC filles (non commité)
│   ├── [mini-jeu]/           # Clone git d'un mini-jeu
│   ├── docs/                 # Documentation des modifications
│   └── gamemaster-client.ts  # SDK de référence
├── uploads/                  # Photos (si besoin local)
└── data/                     # escape.db
```

## Architecture Socket.IO

### Mini-jeu → Backoffice

**Register (connexion initiale) :**

```js
{
  gameId: "coffre",
  name: "Le Coffre Mystère",
  availableActions: [
    { id: "unlock", label: "Débloquer" },
    { id: "reset", label: "Reset" },
    { id: "hint", label: "Indice", params: ["level"] }
  ]
}
```

**State update :**

```js
{ type: "state_update", state: { solved: true, attempts: 3 } }
```

**Event :**

```js
{ type: "event", name: "player_stuck", data: { since: 120 } }
```

### Backoffice → Mini-jeu

**Command :**

```js
{ type: "command", action: "unlock", payload: {} }
{ type: "command", action: "hint", payload: { level: 2 } }
```

## DB Schema

```sql
-- Sessions de jeu (équipes récupérées depuis API externe)
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  team_id INTEGER,
  team_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'paused', 'finished')),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Logs pour stats post-event
CREATE TABLE session_logs (
  id INTEGER PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  event_type TEXT NOT NULL,
  game_id TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- État des mini-jeux connectés (runtime, pas persisté entre redémarrages)
-- Géré en mémoire côté Socket.IO, pas en DB
```

## Inscription (externe)

Les équipes s'inscrivent via un service séparé (repo `inscription-escape`).

Le backoffice fetch les données via :

```
GET https://[inscription-service]/api/teams
GET https://[inscription-service]/api/teams?slot=X
GET https://[inscription-service]/api/slots
```

Le backoffice ne stocke pas les équipes, il les récupère à la demande et crée une session locale quand une équipe commence à jouer.

## SDK Mini-jeux

Fichier à fournir aux devs des mini-jeux :

```js
// gamemaster-client.js
import { io } from "socket.io-client";

const BACKOFFICE_URL = "http://192.168.10.1:3000"; // ESD MAC
// const BACKOFFICE_URL = "http://192.168.1.46:3000"; // THOMAS HOME
// const BACKOFFICE_URL = "http://10.14.73.40:3000"; // THOMAS ESD

const socket = io(BACKOFFICE_URL);

export const gamemaster = {
  register(gameId, name, availableActions = []) {
    socket.emit("register", { gameId, name, availableActions });
  },

  onCommand(callback) {
    socket.on("command", callback);
  },

  updateState(state) {
    socket.emit("state_update", { state });
  },

  sendEvent(name, data = {}) {
    socket.emit("event", { name, data });
  },

  onDisconnect(callback) {
    socket.on("disconnect", callback);
  },
};
```

**Intégration côté mini-jeu :**

```js
import { gamemaster } from "./gamemaster-client";

// Au démarrage
gamemaster.register("coffre", "Le Coffre Mystère", [
  { id: "unlock", label: "Débloquer le coffre" },
  { id: "reset", label: "Réinitialiser" },
  { id: "hint", label: "Afficher indice", params: ["level"] },
]);

// Écouter les commandes du gamemaster
gamemaster.onCommand(({ action, payload }) => {
  if (action === "unlock") unlockChest();
  if (action === "hint") showHint(payload.level);
});

// Signaler un changement d'état
gamemaster.updateState({ locked: false, solved: true });
```

## Conventions

| Élément           | Convention                                                 |
| ----------------- | ---------------------------------------------------------- |
| Langue code       | Anglais                                                    |
| Langue contenu UI | Français                                                   |
| Commentaires      | Anglais, uniquement si nécessaire                          |
| Package manager   | pnpm                                                       |
| Nommage fichiers  | kebab-case pour fichiers, PascalCase pour composants React |

## Commandes

```bash
pnpm dev              # Lance le serveur back
pnpm lint             # ESLint
pnpm format           # Prettier
cd client && pnpm dev # Lance le front React
```

## Communication

- Direct et concis
- Pas de validation automatique
- Corriger les erreurs immédiatement
- Proposer des alternatives si approche sous-optimale
- Pas de formules creuses ("Super !", "Excellent !")

## Projets Externes (external/)

Le dossier `external/` contient les clones git des projets des PC filles (mini-jeux) pour référence et documentation. **Ce dossier n'est jamais commité.**

### Structure

- `external/[nom-projet]/` - Clone git d'un mini-jeu
- `external/docs/` - Documentation des modifications à demander aux équipes
- `external/gamemaster-client.ts` - SDK de référence pour les mini-jeux

### Utilisation

**Ajouter un mini-jeu :**

```bash
cd external
git clone <url-du-repo> [nom-projet]
```

**Ne jamais modifier ces fichiers directement.** Pour demander une modification :

1. Créer un document dans `external/docs/` expliquant le problème et la solution
2. Transmettre ce document à l'équipe responsable du mini-jeu concerné

Format du document : `external/docs/[PROJET]-[description].md`
