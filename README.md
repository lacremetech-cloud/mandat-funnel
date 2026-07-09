# Prodigio — Funnel de génération de mandats vendeurs

Landing page + quiz 4 étapes pour transformer un propriétaire vendeur en
rendez-vous qualifié avec Cyril. Positionnement : **agence immobilière nouvelle
génération** sur l'axe **Narbonne – Béziers – Sète – Montpellier**.

> Promesse centrale : **« Vous vendez ? On vous trouve l'acheteur. »**

## Aperçu

Page unique, **mobile-first**, sans build ni dépendance :

```
index.html                → landing complète (hero + différenciation + preuve
                             + quiz intégré + « comment ça marche » + Cyril + footer)
assets/css/styles.css     → design system (blanc cassé · encre · vert sapin)
assets/js/funnel.js       → logique quiz, scoring, validation, soumission, tracking
```

Le quiz est intégré à la landing : **1 question par écran**, sélection au clic →
**avance automatique**, barre de progression « Étape X sur 4 », bouton retour,
puis écran coordonnées et page merci — le tout sans rechargement.

## Parcours

```
Hero → Quiz (Q1 type · Q2 secteur · Q3 valeur · Q4 délai)
     → Coordonnées (prénom* · téléphone* · email)
     → Page merci (« Cyril vous rappelle sous 24 h »)
```

Personne n'est jamais disqualifié visiblement : **tout le monde arrive à la page
merci**. Le tri se fait via le tag de scoring envoyé au CRM.

## Scoring des leads (invisible pour le prospect)

Calculé dans `funnel.js` (`computeLeadScore`) et envoyé au CRM dans `leadTag` :

| Profil     | Conditions                              | Action CRM            |
|------------|-----------------------------------------|-----------------------|
| 🔥 CHAUD   | valeur ≥ 300 k€ **et** délai ≤ 6 mois   | rappel < 1 h, prioritaire |
| 🟠 TIÈDE   | délai « d'ici 1 an » (et cas par défaut)| rappel < 24 h + relances |
| ⚪️ FROID   | « je me renseigne » **ou** valeur inconnue | rappel + nurturing |

Les seuils sont portés par des attributs `data-band` (valeur) et `data-speed`
(délai) sur les boutons du quiz dans `index.html` — modifiez-les là si les
tranches évoluent.

## Configuration (production)

Tout se règle en tête de `assets/js/funnel.js`, objet `CONFIG` :

```js
var CONFIG = {
  crmWebhookUrl:  "",  // webhook Make/Zapier/n8n : crée le contact, applique le tag,
                       // notifie Cyril, déclenche l'anti-no-show + la CAPI Meta.
  calendlyUrl:    "",  // agenda Cyril → bouton secondaire sur la page merci (optionnel)
  thankYouRedirect: "" // redirige vers une page merci dédiée au lieu de l'écran inline
};
```

- **`crmWebhookUrl` vide** → la soumission déroule directement la page merci
  (utile quand le formulaire natif de Systeme.io gère l'envoi, voir ci-dessous).
- Si l'appel réseau échoue, le lead est **conservé en `localStorage`**
  (`prodigio_failed_leads`) et le prospect voit quand même la page merci.

### Tracking Meta (Pixel + Conversions API)

Dans `index.html`, renseignez `fbq('init', 'YOUR_PIXEL_ID')` puis passez
`window.__PRODIGIO_PIXEL_ENABLED__ = true`. Événements émis :

- `PageView` au chargement,
- `QuizStep` (custom) à chaque réponse,
- `Lead` à la soumission, avec `content_category` = tag de scoring.

La **Conversions API** doit être déclenchée **côté serveur** depuis le webhook CRM
(plus fiable que le navigateur). Dédupliquez avec un `eventID` partagé si vous
émettez le `Lead` des deux côtés.

## Déploiement

### Systeme.io (cible du brief)
Reconstituez la landing avec l'éditeur, ou intégrez ce HTML/CSS/JS dans un bloc
« code personnalisé ». Points d'attention :
- **Webfont hébergé** (pas de police système en prod) — Fraunces + Inter sont
  chargées ici via Google Fonts ; pour de meilleures perfs, self-hostez-les.
- Branchez le formulaire natif Systeme.io au CRM (création contact + tag) ou
  pointez `crmWebhookUrl` vers votre automatisation.
- Ajoutez le lien Calendly de Cyril sur la page merci et pour l'appel.

### Hébergement statique (Netlify, Vercel, GitHub Pages…)
Déployez le dossier tel quel — aucun build requis.

## À personnaliser avant mise en ligne

- [ ] Photo de Cyril → `assets/img/cyril.jpg` (remplacer le placeholder `.cyril__photo`)
- [ ] `CONFIG.crmWebhookUrl`, `CONFIG.calendlyUrl`
- [ ] Meta Pixel ID + activation `__PRODIGIO_PIXEL_ENABLED__`
- [ ] Self-hoster les webfonts
- [ ] Registre des mandats électronique (Hoguet, horodaté) pour le closing

## Conformité (loi Hoguet & RGPD)

Éléments déjà présents à l'écran, à conserver :
- mention **carte T** (bandeau confiance + footer),
- mention de traitement des données sur l'écran coordonnées,
- « Aucune diffusion de votre bien sans votre accord écrit »,
- aucune promesse d'acheteur nommé, aucun « prix garanti ».

À prévoir côté back-office : registre des mandats horodaté, durées de
conservation des données, procédure de droit d'accès/suppression.
