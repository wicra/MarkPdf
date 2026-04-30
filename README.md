# MarkPDF

Convertisseur **Markdown + Mermaid → PDF** hébergeable gratuitement sur [Render](https://render.com).

Collez du Markdown dans l'éditeur (ou ouvrez un fichier `.md`), visualisez le rendu en temps réel côté droit, et téléchargez le PDF A4 en un clic.

---

## Fonctionnalités

- Aperçu Markdown en temps réel avec rendu Mermaid (flowchart, séquence, classes, etc.)
- Export PDF A4 : numérotation des pages, header/footer, tableaux coupés proprement
- Glisser-déposer d'un fichier `.md` sur l'éditeur
- 100 % open source, déployable en quelques minutes

---

## Déploiement sur Render (gratuit)

1. Forkez / clonez ce dépôt sur votre compte GitHub
2. Connectez-vous sur [render.com](https://render.com) et créez un **New Web Service**
3. Sélectionnez votre dépôt GitHub
4. Render détecte automatiquement le `Dockerfile` et le `render.yaml`
5. Plan : **Free** — cliquez **Deploy**

Le premier démarrage prend ~3 minutes (build de l'image Docker avec Chromium).  
L'instance se met en veille après 15 minutes d'inactivité (plan gratuit) et se réveille en ~30 secondes.

---

## Développement local

```bash
npm install
npm start
# Ouvrir http://localhost:3000
```

> Puppeteer télécharge Chromium automatiquement lors du premier `npm install` (~300 Mo).

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Serveur | Node.js + Express |
| Rendu Markdown | marked.js |
| Génération PDF | Puppeteer + Chromium |
| Diagrammes | Mermaid.js |
| Déploiement | Docker sur Render |

---

## Licence

MIT
