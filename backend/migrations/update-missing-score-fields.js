// =============================================
// MISE À JOUR DES CHAMPS DE SCORE MANQUANTS
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

// Logger simple
const logger = {
    info: (message) => console.log(`ℹ️  ${message}`),
    warn: (message) => console.warn(`⚠️  ${message}`),
    error: (message, error) => {
        console.error(`❌ ${message}`);
        if (error) console.error(error);
    }
};

// =============================================
// FONCTION PRINCIPALE
// =============================================

async function updateMissingScoreFields() {
    console.log('\n🎾 MISE À JOUR DES CHAMPS DE SCORE MANQUANTS');
    console.log('==============================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    let processedMatches = 0;
    let updatedMatches = 0;
    let errors = 0;
    
    try {
        await connectDatabase();
        
        // Récupérer tous les matchs qui ont un score_raw mais pas les détails calculés
        console.log('📊 Recherche des matchs avec score_raw mais sans détails...');
        const matchesWithMissingDetails = await pgDB.query(`
            SELECT 
                id, 
                score_raw,
                sets_winner, 
                sets_loser, 
                total_sets,
                games_winner, 
                games_loser, 
                total_games, 
                has_tiebreak,
                tiebreaks_count, 
                is_walkover
            FROM matches 
            WHERE (score_raw IS NOT NULL AND score_raw != '') 
              AND (
                  sets_winner IS NULL OR sets_winner = 0 OR
                  games_winner IS NULL OR games_winner = 0 OR
                  total_sets IS NULL OR total_sets = 0 OR
                  total_games IS NULL OR total_games = 0 OR
                  has_tiebreak IS NULL OR
                  tiebreaks_count IS NULL OR
                  is_walkover IS NULL
              )
            ORDER BY match_date DESC
        `);
        
        console.log(`📈 ${matchesWithMissingDetails.rows.length} matchs trouvés avec détails manquants`);
        
        if (matchesWithMissingDetails.rows.length === 0) {
            console.log('✅ Aucun match avec détails manquants à traiter');
            return;
        }
        
        // Traitement par lots
        const batchSize = 100;
        const totalMatches = matchesWithMissingDetails.rows.length;
        
        for (let i = 0; i < totalMatches; i += batchSize) {
            const batch = matchesWithMissingDetails.rows.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const match of batch) {
                    try {
                        // Utiliser score_raw
                        const scoreToUse = match.score_raw;
                        
                        // Parser le score pour obtenir les détails
                        const scoreData = parseScore(scoreToUse);
                        
                        console.log(`    🔄 Traitement match ID ${match.id}`);
                        console.log(`       Score: "${scoreToUse}"`);
                        console.log(`       Détails: sets ${scoreData.sets_winner}-${scoreData.sets_loser}, jeux ${scoreData.games_winner}-${scoreData.games_loser}, walkover: ${scoreData.is_walkover}`);
                        
                        // Mettre à jour avec les données calculées
                        await pgDB.query(`
                            UPDATE matches SET 
                                sets_winner = $2,
                                sets_loser = $3,
                                total_sets = $4,
                                games_winner = $5,
                                games_loser = $6,
                                total_games = $7,
                                has_tiebreak = $8,
                                tiebreaks_count = $9,
                                is_walkover = $10
                            WHERE id = $1
                        `, [
                            match.id,
                            scoreData.sets_winner,
                            scoreData.sets_loser,
                            scoreData.total_sets,
                            scoreData.games_winner,
                            scoreData.games_loser,
                            scoreData.total_games,
                            scoreData.has_tiebreak,
                            scoreData.tiebreaks_count,
                            scoreData.is_walkover
                        ]);
                        
                        updatedMatches++;
                        console.log(`       ✅ Détails mis à jour`);
                        
                        processedMatches++;
                        
                    } catch (error) {
                        errors++;
                        console.error(`    ❌ Erreur match ${match.id}:`, error.message);
                    }
                }
                
                await pgDB.query('COMMIT');
                
                // Progress reporting
                if (i % (batchSize * 5) === 0 || i + batchSize >= totalMatches) {
                    const progress = Math.min(i + batchSize, totalMatches);
                    const percentage = Math.round((progress / totalMatches) * 100);
                    console.log(`    Progress: ${progress}/${totalMatches} matchs (${percentage}%) - ${updatedMatches} mis à jour`);
                }
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                errors += batch.length;
                console.error(`    ❌ Erreur lot ${i}-${i + batchSize}:`, error.message);
            }
        }
        
        console.log('\n✅ MISE À JOUR TERMINÉE');
        console.log(`📊 Résumé:`);
        console.log(`   - Matchs traités: ${processedMatches}`);
        console.log(`   - Matchs mis à jour: ${updatedMatches}`);
        console.log(`   - Erreurs: ${errors}`);
        
        // Statistiques finales
        await displayFinalStats();
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabase();
    }
}

// =============================================
// FONCTIONS DE PARSING DES SCORES
// =============================================

function parseScore(scoreStr) {
    if (!scoreStr || scoreStr.trim() === '') {
        return getDefaultScoreData();
    }
    
    const score = scoreStr.trim();
    
    // Vérifier si c'est un abandon/walkover
    if (isWalkover(score)) {
        return {
            sets_winner: null,
            sets_loser: null,
            total_sets: null,
            games_winner: null,
            games_loser: null,
            total_games: null,
            has_tiebreak: false,
            tiebreaks_count: 0,
            is_walkover: true
        };
    }
    
    // Parser le score normal
    return parseNormalScore(score);
}

function getDefaultScoreData() {
    return {
        sets_winner: null,
        sets_loser: null,
        total_sets: null,
        games_winner: null,
        games_loser: null,
        total_games: null,
        has_tiebreak: false,
        tiebreaks_count: 0,
        is_walkover: false
    };
}

function isWalkover(score) {
    const walkoverPatterns = [
        /w\.?o\.?/i,      // W.O., WO, w.o., wo
        /walkover/i,      // Walkover
        /def\.?/i,        // DEF, def
        /abd\.?/i,        // ABD, abd (abandoned)
        /ret\.?/i,        // RET, ret (retired)
        /retired/i,       // Retired
        /abandon/i,       // Abandon, abandoned
        /withdrawal/i,    // Withdrawal
        /scratch/i        // Scratch
    ];
    
    return walkoverPatterns.some(pattern => pattern.test(score));
}

function parseNormalScore(score) {
    try {
        // Diviser en sets (par espaces)
        const sets = score.split(/\s+/).filter(set => set.length > 0);
        
        let setsWinner = 0;
        let setsLoser = 0;
        let gamesWinner = 0;
        let gamesLoser = 0;
        let totalGames = 0;
        let hasTiebreak = false;
        let tiebreaksCount = 0;
        
        for (const setStr of sets) {
            const setData = parseSet(setStr);
            if (setData) {
                // Déterminer qui a gagné le set
                if (setData.games1 > setData.games2) {
                    // Le premier joueur a gagné ce set
                    setsWinner++;
                    gamesWinner += setData.games1;
                    gamesLoser += setData.games2;
                } else {
                    // Le deuxième joueur a gagné ce set
                    setsLoser++;
                    gamesWinner += setData.games1;
                    gamesLoser += setData.games2;
                }
                
                totalGames += setData.games1 + setData.games2;
                
                if (setData.hasTiebreak) {
                    hasTiebreak = true;
                    tiebreaksCount++;
                }
            }
        }
        
        return {
            sets_winner: setsWinner,
            sets_loser: setsLoser,
            total_sets: setsWinner + setsLoser,
            games_winner: gamesWinner,
            games_loser: gamesLoser,
            total_games: totalGames,
            has_tiebreak: hasTiebreak,
            tiebreaks_count: tiebreaksCount,
            is_walkover: false
        };
        
    } catch (error) {
        console.error('Erreur parsing score:', score, error.message);
        return getDefaultScoreData();
    }
}

function parseSet(setStr) {
    try {
        // Supprimer les espaces
        const cleanSet = setStr.trim();
        
        // Vérifier s'il y a un tie-break (entre parenthèses)
        const tiebreakMatch = cleanSet.match(/\((\d+)\)/);
        const hasTiebreak = !!tiebreakMatch;
        
        // Extraire les jeux (avant les parenthèses s'il y en a)
        const gamesStr = cleanSet.replace(/\s*\([^)]*\)\s*/, '');
        
        // Parser les jeux (format: "6-4", "7-6", etc.)
        const gamesMatch = gamesStr.match(/^(\d+)-(\d+)$/);
        if (!gamesMatch) {
            return null;
        }
        
        const games1 = parseInt(gamesMatch[1]);
        const games2 = parseInt(gamesMatch[2]);
        
        return {
            games1,
            games2,
            hasTiebreak
        };
        
    } catch (error) {
        return null;
    }
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function displayFinalStats() {
    try {
        const stats = await pgDB.query(`
            SELECT 
                COUNT(*) as total_matches,
                COUNT(CASE WHEN score_raw IS NOT NULL AND score_raw != '' THEN 1 END) as matches_with_score,
                COUNT(CASE WHEN sets_winner IS NOT NULL AND sets_winner > 0 THEN 1 END) as matches_with_sets,
                COUNT(CASE WHEN games_winner IS NOT NULL AND games_winner > 0 THEN 1 END) as matches_with_games,
                COUNT(CASE WHEN has_tiebreak = true THEN 1 END) as matches_with_tiebreaks,
                COUNT(CASE WHEN is_walkover = true THEN 1 END) as matches_walkovers,
                AVG(CASE WHEN total_sets IS NOT NULL AND total_sets > 0 THEN total_sets END) as avg_sets,
                AVG(CASE WHEN total_games IS NOT NULL AND total_games > 0 THEN total_games END) as avg_games
            FROM matches
        `);
        
        const data = stats.rows[0];
        console.log(`\n📈 Statistiques finales des scores:`)
        console.log(`   - Total matchs: ${data.total_matches}`);
        console.log(`   - Matchs avec score_raw: ${data.matches_with_score}`);
        console.log(`   - Matchs avec détails sets: ${data.matches_with_sets}`);
        console.log(`   - Matchs avec détails jeux: ${data.matches_with_games}`);
        console.log(`   - Matchs avec tie-breaks: ${data.matches_with_tiebreaks}`);
        console.log(`   - Matchs walkovers: ${data.matches_walkovers}`);
        
        if (data.avg_sets) {
            console.log(`   - Moyenne sets par match: ${parseFloat(data.avg_sets).toFixed(1)}`);
            console.log(`   - Moyenne jeux par match: ${parseFloat(data.avg_games).toFixed(1)}`);
        }
        
        const completionRate = data.matches_with_score > 0 
            ? Math.round((data.matches_with_sets / data.matches_with_score) * 100)
            : 0;
        console.log(`   - Taux de completion détails: ${completionRate}%`);
        
    } catch (error) {
        console.error('Erreur affichage statistiques:', error.message);
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
    updateMissingScoreFields().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    updateMissingScoreFields
};