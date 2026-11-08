# KYCE CRM

Ce projet compte automatiquement les comptes Instagram postés par tes VA sur Discord et les affiche dans un dashboard web.

Guide pas à pas, aucune connaissance en code nécessaire. Compte environ 20 minutes.

## Avant de commencer

Installe **Node.js version 22.13 ou plus récente** : va sur <https://nodejs.org>, télécharge la version **LTS** et lance l'installateur en gardant les options par défaut.

Pour vérifier, ouvre un terminal (sur Windows : menu Démarrer, tape `PowerShell`) et tape :

```bash
node -v
```

Tu dois voir un numéro comme `v24.x.x`.

## 1. Créer le bot Discord et récupérer le token

1. Va sur <https://discord.com/developers/applications> et connecte-toi.
2. Clique sur **New Application**, donne-lui un nom (par exemple `KYCE CRM`), accepte les conditions et clique sur **Create**.
3. Dans le menu de gauche, clique sur **Bot**.
4. Clique sur **Reset Token**, confirme, puis **Copy**. Colle ce token dans un bloc-notes pour l'étape 3.
5. Sur la même page, descends jusqu'à **Privileged Gateway Intents** et active **MESSAGE CONTENT INTENT**.
6. Clique sur **Save Changes** en bas.

> **Attention :** le token est le mot de passe du bot. Ne le partage jamais et ne l'envoie à personne. S'il fuite, retourne sur cette page et clique de nouveau sur **Reset Token**.

Si tu oublies l'étape 5, le bot ne pourra pas se connecter ou ne verra pas le contenu des messages.

## 2. Inviter le bot sur ton serveur

1. Toujours sur le portail développeur, clique sur **General Information** et copie l'**Application ID**.
2. Prends le lien ci-dessous, remplace `TON_APPLICATION_ID` par ce numéro, et ouvre-le dans ton navigateur :

   ```text
   https://discord.com/oauth2/authorize?client_id=TON_APPLICATION_ID&permissions=66560&scope=bot
   ```

3. Choisis ton serveur et clique sur **Autoriser**.

Ce lien donne uniquement au bot les permissions **Voir les salons** et **Voir les anciens messages**. Sur Discord, la lecture des messages en direct fait partie de « Voir les salons ».

**Si la catégorie SALON PERSO est privée**, le bot doit y avoir accès :

1. Sur Discord, fais un clic droit sur la catégorie **SALON PERSO** puis **Modifier la catégorie**.
2. Va dans **Permissions**, puis **Ajouter des membres ou des rôles**, et ajoute le bot.
3. Coche **Voir les salons** et **Voir les anciens messages**, puis enregistre.

Si certains salons ont leurs propres permissions, fais la même chose sur ces salons.

## 3. Configurer le fichier `.env`

Ouvre le fichier `.env` du dossier `kyce-crm` avec le Bloc-notes et colle ton token après `DISCORD_TOKEN=`, sans espace ni guillemets :

```text
DISCORD_TOKEN=ton_token_ici
CATEGORY_NAME=SALON PERSO
PORT=3000
```

`CATEGORY_NAME` est le nom de ta catégorie Discord. Le bot suit toutes les catégories dont le nom le contient, par exemple `SALON PERSO 2`. Les majuscules n'ont pas d'importance.

Si le fichier `.env` n'apparaît pas, active l'affichage des fichiers cachés dans l'Explorateur, ou copie `.env.example` et renomme la copie en `.env`.

## 4. Installer et lancer en local

Ouvre un terminal **dans le dossier `kyce-crm`** (dans l'Explorateur Windows : ouvre le dossier, clique dans la barre d'adresse, tape `powershell` puis Entrée).

Installe les dépendances, une seule fois :

```bash
npm install
```

Lance l'application :

```bash
npm start
```

Ouvre ensuite <http://localhost:3000> dans ton navigateur.

Dans le terminal, tu dois voir `Connecté en tant que...` et le nombre de salons trouvés. Au premier lancement, le bot lit tout l'historique des salons. **Cela peut prendre de quelques minutes à plus d'une heure** selon le nombre de messages, car Discord limite la vitesse de lecture. Le dashboard se remplit au fur et à mesure.

Pour arrêter : `Ctrl + C` dans le terminal.

## 5. Déployer sur Railway

Railway fait tourner l'application 24h/24 et te donne une adresse web.

### a. Mettre le code sur GitHub

1. Crée un compte sur <https://github.com>.
2. Clique sur **+** en haut à droite puis **New repository**, donne un nom, choisis **Private** et clique sur **Create repository**.
3. Clique sur **uploading an existing file**.
4. Glisse le **contenu** du dossier `kyce-crm`, **sauf** ces éléments :
   - `.env` (il contient ton token)
   - `node_modules`
   - `data`
5. Vérifie que `.env` n'apparaît pas dans la liste, puis clique sur **Commit changes**.

Windows ou GitHub peuvent ne pas importer `.gitignore`. Ce n'est pas bloquant, tant que tu n'envoies jamais `.env`.

### b. Créer le service

1. Crée un compte sur <https://railway.com> en te connectant avec GitHub. Un abonnement peut être nécessaire pour un service qui tourne en continu : regarde leur page de tarifs.
2. Clique sur **New Project**, puis **Deploy from GitHub repo**, et choisis ton dépôt.

### c. Ajouter les variables

Clique sur le service, puis sur l'onglet **Variables**, et ajoute :

| Nom | Valeur |
| --- | --- |
| `DISCORD_TOKEN` | ton token |
| `CATEGORY_NAME` | `SALON PERSO` |

N'ajoute pas `PORT` : Railway le gère tout seul.

### d. Ajouter le volume (obligatoire)

Sans volume, **toutes les données sont effacées à chaque redéploiement**.

1. Dans le projet, fais un clic droit sur le fond du canevas, ou appuie sur `Ctrl + K`, et choisis **Volume** (ou **Add Volume**).
2. Attache-le à ton service.
3. Comme **Mount path**, saisis `/data`.

L'application détecte le volume toute seule et y place sa base de données.

### e. Obtenir l'adresse du dashboard

1. Clique sur le service, puis **Settings**, section **Networking**.
2. Clique sur **Generate Domain**. Si Railway demande un port, laisse celui qu'il propose.
3. Ouvre l'adresse donnée : c'est ton dashboard.

Si le service n'a pas redémarré après l'ajout des variables ou du volume, clique sur **Deploy** ou **Redeploy**. L'onglet **Deployments**, puis **View Logs**, affiche les mêmes messages que le terminal.

> **Important :** comme demandé, le dashboard n'a pas de mot de passe. Toute personne qui possède l'adresse peut voir les noms des VA et les liens. Ne la partage qu'avec les personnes de confiance.

## Comment sont calculés les chiffres

- **Fuseau horaire :** tout est en UTC. Une journée va de 00:00 à 23:59 UTC et le compteur repart à zéro à minuit UTC.
- **Doublons :** un même compte Instagram posté deux fois par le même VA compte une seule fois, même si les paramètres après `?` sont différents.
- **VA actif :** un VA qui a posté au moins un lien sur les 7 derniers jours. Les anciens VA retrouvés dans l'historique ne déclenchent donc pas d'alerte.
- **VA à 0 compte insta :** un VA actif qui n'a posté aucun compte à la date choisie.
- **Alerte « depuis plus d'1 jour » :** un VA actif dont le dernier compte posté date de plus de 24 heures.
- **Nouveau VA :** il apparaît après son premier lien posté.
- **Bot arrêté ou redéployé :** au redémarrage, il récupère les messages postés pendant son absence.

## En cas de problème

| Message ou symptôme | Solution |
| --- | --- |
| `DISCORD_TOKEN est vide` | Remplis le token dans `.env`, ou dans les variables Railway. |
| `Connexion à Discord impossible` | Vérifie le token et active **MESSAGE CONTENT INTENT** (étape 1). |
| `Aucun salon dans la catégorie` | Vérifie `CATEGORY_NAME` et que le bot a accès à la catégorie (étape 2). |
| `Lecture impossible de #salon` | Donne au bot l'accès à ce salon. Il le lira automatiquement. |
| Une erreur sur `node:sqlite` | Installe une version plus récente de Node.js. |
| Données perdues après un déploiement | Le volume n'est pas attaché (étape 5d). |

Pour vérifier le fonctionnement interne : `npm test`.
