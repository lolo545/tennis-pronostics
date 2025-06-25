// =============================================
// CORRECTION DES DONNÉES VAINQUEUR/PERDANT
// =============================================

const { Client } = require('pg');
require('dotenv').config();

// Essayer de charger ODBC, avec fallback si indisponible
let odbc = null;
try {
    odbc = require('odbc');
} catch (error) {
    console.warn('⚠️  Module ODBC non disponible:', error.message);
    console.warn('⚠️  Utilisation du mode PostgreSQL uniquement');
}

// Configuration
const accessConfig = {
    connectionString: process.env.ACCESS_CONNECTION_STRING
};

const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'tennis_pronostics',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD
};

let accessDB, pgDB;

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

async function fixWinnerLoserLogic() {
    console.log('\n🔧 CORRECTION DES DONNÉES VAINQUEUR/PERDANT');
    console.log('===========================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    let processedMatches = 0;
    let correctedMatches = 0;
    let errors = 0;
    
    try {
        await connectDatabases();
        
        if (!accessDB) {
            console.log('❌ Impossible de se connecter à Access. Script annulé.');
            return;
        }
        
        // Traiter ATP et WTA
        await fixMatchesForTour('ATP');
        await fixMatchesForTour('WTA');
        
        console.log('\n✅ CORRECTION TERMINÉE');
        console.log(`📊 Résumé global:`);
        console.log(`   - Matchs traités: ${processedMatches}`);
        console.log(`   - Matchs corrigés: ${correctedMatches}`);
        console.log(`   - Erreurs: ${errors}`);
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabases();
    }
}

async function fixMatchesForTour(tour) {
    console.log(`\n🏆 Correction des matchs ${tour}...`);
    
    try {
        // Récupérer tous les matchs PostgreSQL pour ce tour qui pourraient être incorrects
        const pgMatches = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.score_raw,
                m.winner_ranking,
                m.winner_points,
                m.loser_ranking,
                m.loser_points,
                m.winner_odds,
                m.loser_odds,
                t.${tour.toLowerCase()}_id as tournament_access_id,
                r.atp_id as round_access_id,
                pw.${tour.toLowerCase()}_id as winner_access_id,
                pl.${tour.toLowerCase()}_id as loser_access_id
            FROM matches m
            JOIN tournaments t ON m.tournament_id = t.id AND t.tour = $1
            JOIN rounds r ON m.round_id = r.id
            JOIN players pw ON m.winner_id = pw.id AND pw.tour = $1
            JOIN players pl ON m.loser_id = pl.id AND pl.tour = $1
            WHERE t.${tour.toLowerCase()}_id IS NOT NULL
              AND pw.${tour.toLowerCase()}_id IS NOT NULL
              AND pl.${tour.toLowerCase()}_id IS NOT NULL
            ORDER BY m.match_date DESC
        `, [tour]);
        
        console.log(`📊 ${pgMatches.rows.length} matchs ${tour} trouvés dans PostgreSQL`);
        
        let tourProcessed = 0;
        let tourCorrected = 0;
        let tourErrors = 0;
        
        const batchSize = 100;
        const totalMatches = pgMatches.rows.length;
        
        for (let i = 0; i < totalMatches; i += batchSize) {
            const batch = pgMatches.rows.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const pgMatch of batch) {
                    try {
                        // Chercher le match correspondant dans Access
                        const accessQuery = `
                            SELECT ID1_G, ID2_G, RESULT_G
                            FROM games_${tour.toLowerCase()}
                            WHERE ID_T_G = ${pgMatch.tournament_access_id}
                              AND ID_R_G = ${pgMatch.round_access_id}
                              AND ((ID1_G = ${pgMatch.winner_access_id} AND ID2_G = ${pgMatch.loser_access_id}) OR
                                   (ID1_G = ${pgMatch.loser_access_id} AND ID2_G = ${pgMatch.winner_access_id}))
                        `;
                        
                        const accessMatches = await accessDB.query(accessQuery);
                        
                        if (accessMatches.length === 0) {
                            // Match non trouvé dans Access, on ne peut pas corriger
                            tourProcessed++;
                            continue;
                        }
                        
                        const accessMatch = accessMatches[0];
                        
                        // Vérifier si la logique actuelle est correcte
                        const correctWinnerAccessId = accessMatch.ID1_G; // ID1_G = vainqueur
                        const correctLoserAccessId = accessMatch.ID2_G;  // ID2_G = perdant
                        
                        const needsCorrection = 
                            pgMatch.winner_access_id !== correctWinnerAccessId ||
                            pgMatch.loser_access_id !== correctLoserAccessId;
                        
                        if (needsCorrection) {
                            console.log(`    🔄 Correction nécessaire pour match ID ${pgMatch.id}`);
                            console.log(`       Avant: Winner=${pgMatch.winner_access_id}, Loser=${pgMatch.loser_access_id}`);
                            console.log(`       Après: Winner=${correctWinnerAccessId}, Loser=${correctLoserAccessId}`);
                            
                            // Trouver les IDs PostgreSQL corrects
                            const correctWinnerPg = await pgDB.query(`
                                SELECT id FROM players WHERE ${tour.toLowerCase()}_id = $1 AND tour = $2
                            `, [correctWinnerAccessId, tour]);
                            
                            const correctLoserPg = await pgDB.query(`
                                SELECT id FROM players WHERE ${tour.toLowerCase()}_id = $1 AND tour = $2
                            `, [correctLoserAccessId, tour]);
                            
                            if (correctWinnerPg.rows.length === 0 || correctLoserPg.rows.length === 0) {
                                console.log(`       ❌ Joueurs non trouvés en PostgreSQL`);
                                tourErrors++;
                                continue;
                            }
                            
                            const correctWinnerId = correctWinnerPg.rows[0].id;
                            const correctLoserId = correctLoserPg.rows[0].id;
                            
                            // Récupérer les classements corrects
                            const correctWinnerRanking = await findClosestRanking(correctWinnerId, pgMatch.match_date);
                            const correctLoserRanking = await findClosestRanking(correctLoserId, pgMatch.match_date);
                            
                            // Inverser les cotes si nécessaire
                            let correctWinnerOdds = pgMatch.winner_odds;
                            let correctLoserOdds = pgMatch.loser_odds;
                            
                            if (pgMatch.winner_id !== correctWinnerId) {
                                // Les IDs sont inversés, donc les cotes aussi
                                correctWinnerOdds = pgMatch.loser_odds;
                                correctLoserOdds = pgMatch.winner_odds;
                            }
                            
                            // Mettre à jour le match avec les données correctes
                            await pgDB.query(`
                                UPDATE matches SET 
                                    winner_id = $2,
                                    loser_id = $3,
                                    winner_ranking = $4,
                                    winner_points = $5,
                                    loser_ranking = $6,
                                    loser_points = $7,
                                    winner_odds = $8,
                                    loser_odds = $9
                                WHERE id = $1
                            `, [
                                pgMatch.id,
                                correctWinnerId,
                                correctLoserId,
                                correctWinnerRanking?.position || null,
                                correctWinnerRanking?.points || null,
                                correctLoserRanking?.position || null,
                                correctLoserRanking?.points || null,
                                correctWinnerOdds,
                                correctLoserOdds
                            ]);
                            
                            tourCorrected++;
                            console.log(`       ✅ Match corrigé`);
                        }
                        
                        tourProcessed++;
                        
                    } catch (error) {
                        tourErrors++;
                        console.error(`    ❌ Erreur match ${pgMatch.id}:`, error.message);
                    }
                }
                
                await pgDB.query('COMMIT');
                
                // Progress reporting
                if (i % (batchSize * 5) === 0 || i + batchSize >= totalMatches) {
                    const progress = Math.min(i + batchSize, totalMatches);
                    const percentage = Math.round((progress / totalMatches) * 100);
                    console.log(`    Progress: ${progress}/${totalMatches} matchs (${percentage}%) - ${tourCorrected} corrigés`);
                }
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                tourErrors += batch.length;
                console.error(`    ❌ Erreur lot ${i}-${i + batchSize}:`, error.message);
            }
        }
        
        console.log(`  ✅ ${tour}: ${tourProcessed} traités, ${tourCorrected} corrigés, ${tourErrors} erreurs`);
        
        processedMatches += tourProcessed;
        correctedMatches += tourCorrected;
        errors += tourErrors;
        
    } catch (error) {
        console.error(`  ❌ Erreur correction ${tour}:`, error.message);
        errors++;
    }
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function findClosestRanking(playerId, matchDate) {
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
        return null;
    }
}

async function connectDatabases() {
    console.log('📡 Connexion aux bases de données...');
    
    try {
        // Connexion PostgreSQL
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('  ✅ Connexion PostgreSQL établie');
        
        // Connexion Access (optionnelle)
        if (odbc && accessConfig.connectionString) {
            try {
                accessDB = await odbc.connect(accessConfig.connectionString);
                console.log('  ✅ Connexion Access établie');
            } catch (error) {
                console.warn('  ⚠️  Échec connexion Access:', error.message);
                accessDB = null;
            }
        } else {
            console.warn('  ⚠️  ODBC ou chaîne de connexion Access non disponible');
            accessDB = null;
        }
        
    } catch (error) {
        throw new Error(`Échec connexions: ${error.message}`);
    }
}

async function closeDatabases() {
    if (pgDB) {
        try {
            await pgDB.end();
            console.log('📡 Connexion PostgreSQL fermée');
        } catch (error) {
            console.error('Erreur fermeture PostgreSQL:', error.message);
        }
    }
    
    if (accessDB) {
        try {
            await accessDB.close();
            console.log('📡 Connexion Access fermée');
        } catch (error) {
            console.error('Erreur fermeture Access:', error.message);
        }
    }
}

// =============================================
// POINT D'ENTRÉE
// =============================================

if (require.main === module) {
    fixWinnerLoserLogic().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    fixWinnerLoserLogic
};