# 🔄 Configuration de la Synchronisation Automatique

## 📋 Système de Synchronisation Créé

✅ **Script de synchronisation incrémentale** : `migrations/incremental-sync.js`  
✅ **Service de monitoring** : `src/services/syncMonitoring.js`  
✅ **API de gestion** : `src/routes/sync.js`  
✅ **Commandes NPM** configurées  

## ⚠️ Prérequis pour Utilisation Complète

### 1. Base de données PostgreSQL
```bash
# Démarrer PostgreSQL sur le port configuré (5433)
# Ou modifier PG_PORT=5432 dans .env si PostgreSQL est sur le port par défaut

# Vérifier la connexion
psql -h localhost -p 5433 -d tennis_claude_test -U laurent
```

### 2. Drivers ODBC Access (Windows/WSL)
```bash
# Option A: Installer les drivers Microsoft Access
# Télécharger: Microsoft Access Database Engine 2016 Redistributable

# Option B: Utiliser une alternative compatible
npm uninstall odbc
npm install better-sqlite3  # Alternative SQLite
# Ou adapter le script pour utiliser un autre connecteur
```

### 3. Configuration Access Database
```env
# Dans .env, vérifier le chemin
ACCESS_CONNECTION_STRING=DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=C:\chemin\vers\OnCourt.mdb;PWD=motdepasse;
```

## 🚀 Utilisation

### Commandes Disponibles
```bash
# Test de la configuration
node test-sync.js

# Synchronisation manuelle immédiate
npm run sync:incremental

# Démarrer le planificateur automatique (2x/jour)
npm run sync:start-scheduler

# API de monitoring
# GET /api/v1/sync/status
# GET /api/v1/sync/history
# POST /api/v1/sync/trigger
```

### Planification Automatique
Le système synchronise automatiquement 2 fois par jour :
- **06:00** - Synchronisation matinale
- **18:00** - Synchronisation soirée

## 📊 Monitoring et Alertes

### Tables Créées Automatiquement
- `sync_log` - Historique des synchronisations
- `sync_metrics` - Métriques détaillées par table
- `sync_alerts` - Alertes automatiques

### Alertes Automatiques
- ❌ **Échec de synchronisation**
- ⚠️ **Taux d'erreur élevé** (>10%)
- ℹ️ **Aucune nouvelle donnée**

### API Endpoints
```http
GET /api/v1/sync/status        # Statut actuel
GET /api/v1/sync/history       # Historique
GET /api/v1/sync/alerts        # Alertes actives
GET /api/v1/sync/statistics    # Statistiques
POST /api/v1/sync/trigger      # Déclenchement manuel
POST /api/v1/sync/cleanup      # Nettoyage des logs
```

## 🔧 Résolution des Problèmes

### Erreur ODBC "invalid ELF header"
```bash
# Problème de compatibilité WSL/Windows
# Solution 1: Reconstruire le module
npm rebuild odbc

# Solution 2: Utiliser un environnement Windows natif
# Solution 3: Modifier le script pour utiliser un autre connecteur
```

### Erreur PostgreSQL "ECONNREFUSED"
```bash
# Vérifier que PostgreSQL est démarré
sudo service postgresql start

# Vérifier le port
sudo netstat -plunt | grep postgres

# Modifier .env si nécessaire
PG_PORT=5433  # Port par défaut
```

### Base Access inaccessible
```bash
# Vérifier les permissions sur le fichier .mdb
# Vérifier que OnCourt n'est pas ouvert ailleurs
# Tester la chaîne de connexion
```

## 📈 Fonctionnalités

### Synchronisation Intelligente
- ✅ Seulement les données modifiées (basé sur `LAST_UPDATED`)
- ✅ Gestion des erreurs avec retry automatique
- ✅ Transactions pour garantir la cohérence
- ✅ Logging détaillé de toutes les opérations

### Types de Données Synchronisées
- 🏆 **Tournois** ATP/WTA (nouveaux et modifiés)
- 📊 **Classements** (3 derniers mois par défaut)
- 🎾 **Matchs** (3 derniers mois par défaut)

### Optimisations
- 📦 **Traitement par batch** (1000 enregistrements)
- 🔄 **Mappings en cache** pour les performances
- 📈 **Métriques en temps réel**
- 🧹 **Nettoyage automatique** des anciens logs

## 🎯 Prochaines Étapes

1. **Résoudre la connectivité** PostgreSQL et ODBC
2. **Tester la synchronisation** avec `npm run sync:incremental`
3. **Configurer la planification** avec `npm run sync:start-scheduler`
4. **Monitorer via l'API** `/api/v1/sync/status`

Une fois les prérequis installés, le système fonctionnera automatiquement et maintiendra votre base PostgreSQL à jour avec les données Access 2 fois par jour.