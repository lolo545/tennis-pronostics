// =============================================
// CALCUL COMPLET DES ELO POUR TOUS LES MATCHS
// =============================================

const { Client } = require('pg');
require('dotenv').config();

// Configuration PostgreSQL
const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'tennis_pronostics',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD
};

let pgDB;

// Configuration ELO
const ELO_CONFIG = {
    INITIAL_ELO: 1200,           // ELO initial pour nouveaux joueurs
    K_FACTOR: 32,                // Facteur K standard tennis
    SURFACE_HALF_FACTOR: 0.5,   // Facteur pour surfaces différentes
    INACTIVITY_PENALTY: 10,     // Points enlevés par mois d'inactivité
    MIN_ELO: 500,               // ELO minimum autorisé
    MAX_SURFACE_DIFF: 200       // Différence maximum entre ELO général et surface
};

// Cache des ELO par joueur avec dernière date de match
const playerEloCache = {};
const playerLastMatchDate = {};

// Statistiques
let stats = {
    totalMatches: 0,
    processedMatches: 0,
    skippedMatches: 0,
    errors: 0,
    playersWithElo: new Set(),
    eloUpdates: 0,
    inactivityPenalties: 0,
    totalPenaltyPoints: 0
};

// Logger simple
const logger = {
    info: (message) => console.log(`ℹ️  ${message}`),
    warn: (message) => console.warn(`⚠️  ${message}`),
    error: (message, error) => {
        console.error(`❌ ${message}`);
        if (error) console.error(error);
    },
    progress: (current, total, message = '') => {
        const percentage = Math.round((current / total) * 100);
        console.log(`🔄 Progress: ${current}/${total} (${percentage}%) ${message}`);
    }
};

// =============================================
// FONCTION PRINCIPALE
// =============================================

async function calculateAllElo() {
    console.log('\n🎾 CALCUL COMPLET DES ELO POUR TOUS LES MATCHS');
    console.log('==============================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    console.log(`📊 Configuration ELO:`);
    console.log(`   - ELO initial: ${ELO_CONFIG.INITIAL_ELO}`);
    console.log(`   - Facteur K: ${ELO_CONFIG.K_FACTOR}`);
    console.log(`   - Facteur surface différente: ${ELO_CONFIG.SURFACE_HALF_FACTOR}`);
    console.log(`   - Pénalité inactivité: ${ELO_CONFIG.INACTIVITY_PENALTY} pts/mois`);
    console.log(`   - Différence max surface/général: ${ELO_CONFIG.MAX_SURFACE_DIFF} pts`);
    
    try {
        await connectDatabase();
        
        // Vérifier que les colonnes ELO existent
        await verifyEloColumns();
        
        // Récupérer tous les matchs ordonnés
        console.log('\n📊 Récupération des matchs...');
        const matches = await getOrderedMatches();
        
        console.log(`   Total: ${matches.length} matchs à traiter`);
        stats.totalMatches = matches.length;
        
        if (matches.length === 0) {
            console.log('❌ Aucun match trouvé à traiter');
            return;
        }
        
        // Initialiser les ELO à NULL
        await resetAllElo();
        
        // Traiter les matchs par lots
        console.log('\n🔄 Traitement des matchs...');
        const batchSize = 100;
        
        for (let i = 0; i < matches.length; i += batchSize) {
            const batch = matches.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const match of batch) {
                    await processMatch(match);
                    stats.processedMatches++;
                    
                    if (stats.processedMatches % 500 === 0) {
                        logger.progress(stats.processedMatches, stats.totalMatches, 
                            `(${stats.playersWithElo.size} joueurs, ${stats.eloUpdates} mises à jour)`);
                    }
                }
                
                await pgDB.query('COMMIT');
                
                // Progress régulier
                if (i % (batchSize * 10) === 0 || i + batchSize >= matches.length) {
                    logger.progress(Math.min(i + batchSize, matches.length), matches.length);
                }
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                stats.errors += batch.length;
                console.error(`❌ Erreur lot ${i}-${i + batchSize}:`, error.message);
            }
        }
        
        console.log('\n✅ CALCUL ELO TERMINÉ');
        await displayFinalStats();
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabase();
    }
}

// =============================================
// RÉCUPÉRATION DES MATCHS
// =============================================

async function getOrderedMatches() {
    const query = `
        SELECT 
            m.id,
            m.match_date,
            m.winner_id,
            m.loser_id,
            m.tournament_id,
            m.round_id,
            r.display_order,
            t.name as tournament_name,
            t.type_tournoi_id,
            cs.name as surface,
            tt.name as tournament_type
        FROM matches m
        JOIN tournaments t ON m.tournament_id = t.id
        JOIN rounds r ON m.round_id = r.id
        LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
        LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
        WHERE m.match_date IS NOT NULL
          AND m.winner_id IS NOT NULL 
          AND m.loser_id IS NOT NULL
        ORDER BY 
            m.match_date ASC,
            r.display_order ASC,
            m.id ASC
    `;
    
    const result = await pgDB.query(query);
    return result.rows;
}

// =============================================
// TRAITEMENT D'UN MATCH
// =============================================

async function processMatch(match) {
    try {
        const winnerId = match.winner_id;
        const loserId = match.loser_id;
        const surface = match.surface || 'Hard'; // Défaut si surface inconnue
        const matchDate = new Date(match.match_date);
        const isFutures = match.type_tournoi_id === 7;
        
        // Appliquer les pénalités d'inactivité avant le calcul
        const winnerElosBefore = applyInactivityPenalty(winnerId, matchDate);
        const loserElosBefore = applyInactivityPenalty(loserId, matchDate);
        
        // SAUVEGARDER D'ABORD LES ELO AVANT LE MATCH (c'est ce qu'on veut voir dans la base)
        await updateMatchElo(match.id, winnerId, winnerElosBefore, loserId, loserElosBefore);
        
        // Si c'est un tournoi Futures, on ne modifie pas l'ELO mais on met à jour les dates
        if (isFutures) {
            // Mettre à jour seulement les dates de derniers matchs
            playerLastMatchDate[winnerId] = matchDate;
            playerLastMatchDate[loserId] = matchDate;
            
            // Pas de calcul ELO pour les Futures
            stats.skippedMatches++;
            return;
        }
        
        // Pour les autres tournois : calcul ELO normal
        const eloChanges = calculateEloChange(winnerElosBefore.general, loserElosBefore.general);
        
        // Créer des copies pour les calculs après match
        const winnerElosAfter = { ...winnerElosBefore };
        const loserElosAfter = { ...loserElosBefore };
        
        // Mettre à jour les ELO généraux après le match
        winnerElosAfter.general += eloChanges.winner;
        loserElosAfter.general += eloChanges.loser;
        
        // Mettre à jour les ELO par surface après le match
        updateSurfaceEloAfterMatch(winnerElosAfter, loserElosAfter, surface, eloChanges);
        
        // Mettre à jour les dates de derniers matchs
        playerLastMatchDate[winnerId] = matchDate;
        playerLastMatchDate[loserId] = matchDate;
        
        // Sauvegarder dans le cache les ELO APRÈS le match (pour les prochains calculs)
        updatePlayerEloCache(winnerId, winnerElosAfter);
        updatePlayerEloCache(loserId, loserElosAfter);
        
        stats.eloUpdates++;
        
    } catch (error) {
        stats.errors++;
        console.error(`❌ Erreur match ${match.id}:`, error.message);
    }
}

// =============================================
// CALCULS ELO
// =============================================

function applyInactivityPenalty(playerId, currentMatchDate) {
    const playerElos = getPlayerElo(playerId);
    const lastMatchDate = playerLastMatchDate[playerId];
    
    // Si c'est le premier match du joueur, pas de pénalité
    if (!lastMatchDate) {
        return { ...playerElos };
    }
    
    // Calculer les mois d'inactivité
    const monthsInactive = calculateMonthsDifference(lastMatchDate, currentMatchDate);
    
    if (monthsInactive >= 1) {
        // Appliquer la pénalité d'inactivité
        const penalty = Math.floor(monthsInactive) * ELO_CONFIG.INACTIVITY_PENALTY;
        
        // Créer une copie des ELO avec pénalité appliquée
        const penalizedElos = {
            general: Math.max(ELO_CONFIG.MIN_ELO, playerElos.general - penalty),
            clay: Math.max(ELO_CONFIG.MIN_ELO, playerElos.clay - penalty),
            grass: Math.max(ELO_CONFIG.MIN_ELO, playerElos.grass - penalty),
            hard: Math.max(ELO_CONFIG.MIN_ELO, playerElos.hard - penalty),
            ihard: Math.max(ELO_CONFIG.MIN_ELO, playerElos.ihard - penalty)
        };
        
        // Appliquer les contraintes après la pénalité
        applyEloConstraints(penalizedElos);
        
        // Mettre à jour le cache avec les ELO pénalisés
        updatePlayerEloCache(playerId, penalizedElos);
        
        // Mettre à jour les statistiques
        stats.inactivityPenalties++;
        stats.totalPenaltyPoints += penalty;
        
        // Log pour debug si pénalité importante
        if (penalty >= 60) { // 4+ mois
            console.log(`   📉 Joueur ${playerId}: pénalité ${penalty} pts (${Math.floor(monthsInactive)} mois d'inactivité)`);
        }
        
        return penalizedElos;
    }
    
    return { ...playerElos };
}

function calculateMonthsDifference(date1, date2) {
    // Calculer la différence en mois entre deux dates
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // Approximation: 30.44 jours par mois en moyenne
    const diffMonths = diffDays / 30.44;
    
    return diffMonths;
}

function getPlayerElo(playerId) {
    if (!playerEloCache[playerId]) {
        // Nouveau joueur, initialiser tous les ELO
        playerEloCache[playerId] = {
            general: ELO_CONFIG.INITIAL_ELO,
            clay: ELO_CONFIG.INITIAL_ELO,
            grass: ELO_CONFIG.INITIAL_ELO,
            hard: ELO_CONFIG.INITIAL_ELO,
            ihard: ELO_CONFIG.INITIAL_ELO
        };
        stats.playersWithElo.add(playerId);
    }
    
    return playerEloCache[playerId];
}

function calculateEloChange(winnerElo, loserElo) {
    // Formule ELO standard
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 - expectedWinner;
    
    // Résultat: 1 pour victoire, 0 pour défaite
    const actualWinner = 1;
    const actualLoser = 0;
    
    // Changement ELO
    const winnerChange = Math.round(ELO_CONFIG.K_FACTOR * (actualWinner - expectedWinner));
    const loserChange = Math.round(ELO_CONFIG.K_FACTOR * (actualLoser - expectedLoser));
    
    return {
        winner: winnerChange,
        loser: loserChange
    };
}

function updateSurfaceEloAfterMatch(winnerElos, loserElos, surface, eloChanges) {
    // Mapper les surfaces aux champs ELO
    const surfaceMap = {
        'Clay': 'clay',
        'Grass': 'grass', 
        'Hard': 'hard',
        'Indoor Hard': 'ihard',
        'Carpet': 'hard' // Carpet traité comme Hard
    };
    
    const eloField = surfaceMap[surface] || 'hard';
    
    // Pour la surface correspondante : changement complet
    winnerElos[eloField] += eloChanges.winner;
    loserElos[eloField] += eloChanges.loser;
    
    // Pour les autres surfaces : changement réduit de moitié
    const halfWinnerChange = Math.round(eloChanges.winner * ELO_CONFIG.SURFACE_HALF_FACTOR);
    const halfLoserChange = Math.round(eloChanges.loser * ELO_CONFIG.SURFACE_HALF_FACTOR);
    
    Object.keys(surfaceMap).forEach(surf => {
        const field = surfaceMap[surf];
        if (field !== eloField && winnerElos[field] !== undefined) {
            winnerElos[field] += halfWinnerChange;
            loserElos[field] += halfLoserChange;
        }
    });
    
    // Appliquer les contraintes ELO pour le vainqueur
    applyEloConstraints(winnerElos);
    
    // Appliquer les contraintes ELO pour le perdant
    applyEloConstraints(loserElos);
}

function applyEloConstraints(playerElos) {
    // Assurer que les ELO ne descendent pas en dessous du minimum
    Object.keys(playerElos).forEach(key => {
        if (typeof playerElos[key] === 'number') {
            playerElos[key] = Math.max(ELO_CONFIG.MIN_ELO, playerElos[key]);
        }
    });
    
    // Appliquer la contrainte de différence maximum avec l'ELO général
    const generalElo = playerElos.general;
    const surfaceFields = ['clay', 'grass', 'hard', 'ihard'];
    
    surfaceFields.forEach(surface => {
        if (typeof playerElos[surface] === 'number' && typeof generalElo === 'number') {
            const difference = playerElos[surface] - generalElo;
            
            // Si la différence dépasse +200, plafonner à général + 200
            if (difference > ELO_CONFIG.MAX_SURFACE_DIFF) {
                playerElos[surface] = generalElo + ELO_CONFIG.MAX_SURFACE_DIFF;
            }
            // Si la différence dépasse -200, plafonner à général - 200
            else if (difference < -ELO_CONFIG.MAX_SURFACE_DIFF) {
                playerElos[surface] = generalElo - ELO_CONFIG.MAX_SURFACE_DIFF;
            }
        }
    });
}

function updatePlayerEloCache(playerId, elos) {
    playerEloCache[playerId] = { ...elos };
}

// =============================================
// MISE À JOUR BASE DE DONNÉES
// =============================================

async function updateMatchElo(matchId, winnerId, winnerElos, loserId, loserElos) {
    const updateQuery = `
        UPDATE matches SET 
            winner_elo = $2,
            winner_elo_clay = $3,
            winner_elo_grass = $4,
            winner_elo_hard = $5,
            winner_elo_ihard = $6,
            loser_elo = $7,
            loser_elo_clay = $8,
            loser_elo_grass = $9,
            loser_elo_hard = $10,
            loser_elo_ihard = $11
        WHERE id = $1
    `;
    
    await pgDB.query(updateQuery, [
        matchId,
        winnerElos.general,
        winnerElos.clay,
        winnerElos.grass,
        winnerElos.hard,
        winnerElos.ihard,
        loserElos.general,
        loserElos.clay,
        loserElos.grass,
        loserElos.hard,
        loserElos.ihard
    ]);
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function verifyEloColumns() {
    const checkQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'matches' 
        AND column_name LIKE '%elo%'
    `;
    
    const result = await pgDB.query(checkQuery);
    const eloColumns = result.rows.map(row => row.column_name);
    
    const requiredColumns = [
        'winner_elo', 'winner_elo_clay', 'winner_elo_grass', 'winner_elo_hard', 'winner_elo_ihard',
        'loser_elo', 'loser_elo_clay', 'loser_elo_grass', 'loser_elo_hard', 'loser_elo_ihard'
    ];
    
    const missingColumns = requiredColumns.filter(col => !eloColumns.includes(col));
    
    if (missingColumns.length > 0) {
        throw new Error(`Colonnes ELO manquantes: ${missingColumns.join(', ')}`);
    }
    
    console.log(`✅ Colonnes ELO vérifiées: ${eloColumns.length} trouvées`);
}

async function resetAllElo() {
    console.log('🔄 Initialisation des ELO à NULL...');
    
    const resetQuery = `
        UPDATE matches SET 
            winner_elo = NULL,
            winner_elo_clay = NULL,
            winner_elo_grass = NULL,
            winner_elo_hard = NULL,
            winner_elo_ihard = NULL,
            loser_elo = NULL,
            loser_elo_clay = NULL,
            loser_elo_grass = NULL,
            loser_elo_hard = NULL,
            loser_elo_ihard = NULL
    `;
    
    const result = await pgDB.query(resetQuery);
    console.log(`✅ ${result.rowCount} lignes réinitialisées`);
}

async function displayFinalStats() {
    console.log(`\n📊 STATISTIQUES FINALES:`);
    console.log(`   - Total matchs traités: ${stats.processedMatches}/${stats.totalMatches}`);
    console.log(`   - Matchs avec calcul ELO: ${stats.eloUpdates}`);
    console.log(`   - Matchs Futures (ELO preservé): ${stats.skippedMatches}`);
    console.log(`   - Erreurs: ${stats.errors}`);
    console.log(`   - Joueurs avec ELO: ${stats.playersWithElo.size}`);
    console.log(`   - Pénalités d'inactivité: ${stats.inactivityPenalties}`);
    console.log(`   - Total points de pénalité: ${stats.totalPenaltyPoints}`);
    
    // Échantillon d'ELO finaux
    const topPlayers = Object.entries(playerEloCache)
        .sort(([,a], [,b]) => b.general - a.general)
        .slice(0, 10);
    
    if (topPlayers.length > 0) {
        console.log(`\n🏆 TOP 10 ELO GÉNÉRAUX:`);
        for (let i = 0; i < Math.min(5, topPlayers.length); i++) {
            const [playerId, elos] = topPlayers[i];
            console.log(`   ${i + 1}. Joueur ${playerId}: ${elos.general} ELO`);
        }
    }
    
    // Statistiques de distribution
    const allElos = Object.values(playerEloCache).map(e => e.general);
    if (allElos.length > 0) {
        const avgElo = Math.round(allElos.reduce((a, b) => a + b, 0) / allElos.length);
        const minElo = Math.min(...allElos);
        const maxElo = Math.max(...allElos);
        
        console.log(`\n📈 DISTRIBUTION ELO:`);
        console.log(`   - ELO moyen: ${avgElo}`);
        console.log(`   - ELO minimum: ${minElo}`);
        console.log(`   - ELO maximum: ${maxElo}`);
    }
}

async function connectDatabase() {
    console.log('📡 Connexion à PostgreSQL...');
    
    try {
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('  ✅ Connexion PostgreSQL établie');
    } catch (error) {
        throw new Error(`Échec connexion PostgreSQL: ${error.message}`);
    }
}

async function closeDatabase() {
    if (pgDB) {
        try {
            await pgDB.end();
            console.log('📡 Connexion PostgreSQL fermée');
        } catch (error) {
            console.error('Erreur fermeture PostgreSQL:', error.message);
        }
    }
}

// =============================================
// POINT D'ENTRÉE
// =============================================

if (require.main === module) {
    calculateAllElo().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    calculateAllElo
};