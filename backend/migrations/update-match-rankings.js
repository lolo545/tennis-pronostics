// =============================================
// MISE À JOUR DES CLASSEMENTS DANS LES MATCHS
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

async function updateMatchRankings() {
    console.log('\n🔄 MISE À JOUR DES CLASSEMENTS DANS LES MATCHS');
    console.log('===============================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    let processedMatches = 0;
    let updatedMatches = 0;
    let errors = 0;
    
    try {
        await connectDatabase();
        
        // Récupérer tous les matchs sans classements
        console.log('📊 Recherche des matchs sans classements...');
        const matchesWithoutRankings = await pgDB.query(`
            SELECT 
                id, winner_id, loser_id, match_date,
                winner_ranking, winner_points, loser_ranking, loser_points
            FROM matches 
            WHERE (winner_ranking IS NULL OR loser_ranking IS NULL)
              AND match_date IS NOT NULL
            ORDER BY match_date DESC
        `);
        
        console.log(`📈 ${matchesWithoutRankings.rows.length} matchs trouvés sans classements complets`);
        
        if (matchesWithoutRankings.rows.length === 0) {
            console.log('✅ Tous les matchs ont déjà leurs classements');
            return;
        }
        
        // Traitement par lots
        const batchSize = 100;
        const totalMatches = matchesWithoutRankings.rows.length;
        
        for (let i = 0; i < totalMatches; i += batchSize) {
            const batch = matchesWithoutRankings.rows.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const match of batch) {
                    try {
                        // Récupérer les classements si manquants
                        let winnerRanking = null;
                        let loserRanking = null;
                        
                        if (!match.winner_ranking || !match.winner_points) {
                            winnerRanking = await findClosestRanking(match.winner_id, match.match_date);
                        }
                        
                        if (!match.loser_ranking || !match.loser_points) {
                            loserRanking = await findClosestRanking(match.loser_id, match.match_date);
                        }
                        
                        // Mettre à jour seulement si on a trouvé des classements manquants
                        if (winnerRanking || loserRanking) {
                            await pgDB.query(`
                                UPDATE matches SET 
                                    winner_ranking = COALESCE($2, winner_ranking),
                                    winner_points = COALESCE($3, winner_points),
                                    loser_ranking = COALESCE($4, loser_ranking),
                                    loser_points = COALESCE($5, loser_points)
                                WHERE id = $1
                            `, [
                                match.id,
                                winnerRanking?.position || match.winner_ranking,
                                winnerRanking?.points || match.winner_points,
                                loserRanking?.position || match.loser_ranking,
                                loserRanking?.points || match.loser_points
                            ]);
                            
                            updatedMatches++;
                        }
                        
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
        const finalStats = await pgDB.query(`
            SELECT 
                COUNT(*) as total_matches,
                COUNT(CASE WHEN winner_ranking IS NOT NULL THEN 1 END) as matches_with_winner_ranking,
                COUNT(CASE WHEN loser_ranking IS NOT NULL THEN 1 END) as matches_with_loser_ranking,
                COUNT(CASE WHEN winner_ranking IS NOT NULL AND loser_ranking IS NOT NULL THEN 1 END) as matches_with_both_rankings
            FROM matches
        `);
        
        const stats = finalStats.rows[0];
        console.log(`\n📈 Statistiques finales:`);
        console.log(`   - Total matchs: ${stats.total_matches}`);
        console.log(`   - Matchs avec classement vainqueur: ${stats.matches_with_winner_ranking}`);
        console.log(`   - Matchs avec classement perdant: ${stats.matches_with_loser_ranking}`);
        console.log(`   - Matchs avec les deux classements: ${stats.matches_with_both_rankings}`);
        
        const completionRate = stats.total_matches > 0 
            ? Math.round((stats.matches_with_both_rankings / stats.total_matches) * 100)
            : 0;
        console.log(`   - Taux de completion: ${completionRate}%`);
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabase();
    }
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function findClosestRanking(playerId, matchDate) {
    if (!playerId || !matchDate) return null;
    
    try {
        const result = await pgDB.query(`
            SELECT position, points
            FROM player_rankings 
            WHERE player_id = $1 AND ranking_date <= $2
            ORDER BY ranking_date DESC 
            LIMIT 1
        `, [playerId, matchDate]);
        
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error(`Erreur récupération classement joueur ${playerId}:`, error.message);
        return null;
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
    updateMatchRankings().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    updateMatchRankings
};