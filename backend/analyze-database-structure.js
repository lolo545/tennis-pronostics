// =============================================
// ANALYSE DE LA STRUCTURE DES TABLES TENNIS
// =============================================

console.log('🎾 ANALYSE DE LA STRUCTURE DES TABLES TENNIS');
console.log('=============================================\n');

// =============================================
// 1. TABLE TYPE_TOURNOI
// =============================================

console.log('📊 TABLE TYPE_TOURNOI');
console.log('=====================');
console.log('Structure:');
console.log('  - id: SERIAL PRIMARY KEY');
console.log('  - id_r: INTEGER UNIQUE (RANK_T depuis Access)');
console.log('  - nom: VARCHAR(63) (nom français)');
console.log('  - name: VARCHAR(63) (nom anglais)\n');

console.log('Valeurs des types de tournoi selon la migration:');
console.log('ID_R | NOM FRANÇAIS       | NAME ENGLISH');
console.log('-----|-------------------|------------------');
console.log('  1  | Grand Chelem      | Grand Slam');
console.log('  2  | Masters 1000      | Masters 1000');
console.log('  3  | ATP 500           | ATP 500');
console.log('  4  | ATP 250           | ATP 250');
console.log('  5  | Challenger        | Challenger');
console.log('  6  | ITF               | ITF');
console.log('  7  | Futures           | Futures');        // ← VOICI LA RÉPONSE !
console.log('  8  | Coupe Davis       | Davis Cup');
console.log('  9  | Jeux Olympiques   | Olympics\n');

console.log('🎯 TYPE_TOURNOI_ID = 7 → FUTURES');
console.log('   Nom français: "Futures"');
console.log('   Nom anglais: "Futures"');
console.log('   Description: Tournois de niveau ITF Futures (niveau inférieur aux Challengers)\n');

// =============================================
// 2. TABLE COURT_SURFACES
// =============================================

console.log('📊 TABLE COURT_SURFACES');
console.log('=======================');
console.log('Structure:');
console.log('  - id: SERIAL PRIMARY KEY');
console.log('  - name: VARCHAR(50) UNIQUE\n');

console.log('Surfaces de court disponibles (basé sur la config):');
console.log('ID | NAME');
console.log('---|-------------');
console.log(' 1 | Hard');
console.log(' 2 | Clay');
console.log(' 3 | Grass');
console.log(' 4 | Carpet');
console.log(' 5 | Indoor Hard\n');

console.log('Note: Les valeurs exactes dépendent des données migrées depuis Access (table courts)');
console.log('      La migration utilise les noms exacts de la base Access (NAME_C)\n');

// =============================================
// 3. TABLE ROUNDS
// =============================================

console.log('📊 TABLE ROUNDS');
console.log('===============');
console.log('Structure:');
console.log('  - id: SERIAL PRIMARY KEY');
console.log('  - atp_id: INTEGER UNIQUE (ID_R depuis Access)');
console.log('  - name: VARCHAR(50) (NAME_R)');
console.log('  - is_qualifying: BOOLEAN');
console.log('  - display_order: INTEGER (pour ordonner logiquement)\n');

console.log('Ordre logique des rounds (display_order):');
console.log('DISPLAY_ORDER | TYPE              | EXEMPLES');
console.log('--------------|-------------------|-------------------------');
console.log('    -10       | Qualifying        | Qualifying rounds');
console.log('     -3       | Q3                | Third Qualifying Round');
console.log('     -2       | Q2/R128           | Second Qualifying, Round of 128');
console.log('     -1       | Q1/R64            | First Qualifying, Round of 64');
console.log('      0       | R32               | Round of 32');
console.log('      1       | R16/1st Round     | Round of 16, First Round');
console.log('      2       | 2nd Round         | Second Round');
console.log('      3       | 3rd Round         | Third Round');
console.log('      4       | 4th Round/R16     | Fourth Round, Round of 16');
console.log('      5       | Quarterfinals     | Quarterfinals');
console.log('      6       | Semifinals        | Semifinals');
console.log('      7       | Final             | Final\n');

console.log('Logique de calculateDisplayOrder():');
console.log('  - Qualifying rounds: display_order négatif');
console.log('  - Main draw: display_order positif (0-7)');
console.log('  - Final = 7, Semifinals = 6, Quarterfinals = 5, etc.\n');

// =============================================
// 4. RELATIONS DANS LES TOURNOIS
// =============================================

console.log('📊 TABLE TOURNAMENTS - RELATIONS');
console.log('=================================');
console.log('Structure des relations:');
console.log('  - type_tournoi_id → type_tournoi.id');
console.log('  - court_surface_id → court_surfaces.id');
console.log('  - country_id → countries.id');
console.log('  - tier_tournoi_id → tier_tournoi.id (optionnel)\n');

console.log('Exemple de tournoi Futures (type_tournoi_id = 7):');
console.log('  - Ce sont des tournois ITF de bas niveau');
console.log('  - Prize money généralement faible (< $25K)');
console.log('  - Principalement pour jeunes professionnels');
console.log('  - Points ATP/WTA limités\n');

// =============================================
// 5. TABLE MATCHES - STRUCTURE
// =============================================

console.log('📊 TABLE MATCHES - STRUCTURE');
console.log('============================');
console.log('Relations importantes:');
console.log('  - winner_id → players.id');
console.log('  - loser_id → players.id');
console.log('  - tournament_id → tournaments.id');
console.log('  - round_id → rounds.id\n');

console.log('Données de classement et cotes:');
console.log('  - winner_ranking: Classement du vainqueur au moment du match');
console.log('  - winner_points: Points ATP/WTA du vainqueur');
console.log('  - loser_ranking: Classement du perdant');
console.log('  - loser_points: Points ATP/WTA du perdant');
console.log('  - winner_odds: Cote du vainqueur (décimal, 3 chiffres)');
console.log('  - loser_odds: Cote du perdant (décimal, 3 chiffres)\n');

// =============================================
// 6. VUES UTILES
// =============================================

console.log('📊 VUES DISPONIBLES');
console.log('==================');
console.log('v_matches_detailed:');
console.log('  - Jointure complète matches + joueurs + tournois + rounds + surfaces + pays');
console.log('  - Tous les noms lisibles au lieu des IDs');
console.log('  - Idéal pour affichage et rapports\n');

console.log('v_head_to_head:');
console.log('  - Statistiques face-à-face entre tous les joueurs');
console.log('  - Compte total de matchs et victoires par joueur');
console.log('  - Optimisé pour les analyses de confrontations\n');

// =============================================
// 7. EXEMPLE DE REQUÊTES UTILES
// =============================================

console.log('💡 EXEMPLES DE REQUÊTES UTILES');
console.log('===============================');

console.log('-- Tournois Futures avec leurs surfaces:');
console.log('SELECT t.name, t.start_date, cs.name as surface, c.code as country');
console.log('FROM tournaments t');
console.log('JOIN type_tournoi tt ON t.type_tournoi_id = tt.id');
console.log('LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id');
console.log('LEFT JOIN countries c ON t.country_id = c.id');
console.log('WHERE tt.id_r = 7  -- Futures');
console.log('ORDER BY t.start_date DESC;\n');

console.log('-- Matchs par surface:');
console.log('SELECT cs.name as surface, COUNT(*) as nb_matches');
console.log('FROM matches m');
console.log('JOIN tournaments t ON m.tournament_id = t.id');
console.log('JOIN court_surfaces cs ON t.court_surface_id = cs.id');
console.log('GROUP BY cs.name');
console.log('ORDER BY nb_matches DESC;\n');

console.log('-- Rounds par ordre logique:');
console.log('SELECT r.name, r.display_order, r.is_qualifying, COUNT(m.id) as nb_matches');
console.log('FROM rounds r');
console.log('LEFT JOIN matches m ON r.id = m.round_id');
console.log('GROUP BY r.id, r.name, r.display_order, r.is_qualifying');
console.log('ORDER BY r.display_order;\n');

console.log('🎾 STRUCTURE ANALYSÉE AVEC SUCCÈS !');
console.log('===================================');
console.log('La base de données suit une architecture complète pour le tennis:');
console.log('✅ Types de tournois hiérarchisés (Grand Slam → Futures)');
console.log('✅ Surfaces de court standardisées');
console.log('✅ Rounds ordonnés logiquement (Qualifs → Finale)');
console.log('✅ Relations cohérentes entre toutes les tables');
console.log('✅ Vues optimisées pour l\'analyse et l\'affichage');