// =============================================
// MISE À JOUR DES COTES DANS LES MATCHS
// =============================================

const { Client } = require('pg');
require('dotenv').config();

// Logger simple
const logger = {
    info: (message) => console.log(`ℹ️  ${message}`),
    warn: (message) => console.warn(`⚠️  ${message}`),
    error: (message, error) => {
        console.error(`❌ ${message}`);
        if (error) console.error(error);
    }
};

// Essayer de charger ODBC, avec fallback si indisponible
let odbc = null;
try {
    odbc = require('odbc');
} catch (error) {
    console.warn('⚠️  Module ODBC non disponible:', error.message);
    console.warn('⚠️  Ce script nécessite une connexion Access');
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

// =============================================
// FONCTION PRINCIPALE
// =============================================

async function updateMatchOdds() {
    console.log('\n💰 MISE À JOUR DES COTES DANS LES MATCHS');
    console.log('========================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    if (!odbc) {
        console.error('❌ Module ODBC non disponible. Ce script ne peut pas fonctionner sans connexion Access.');
        process.exit(1);
    }
    
    let processedATP = 0;
    let processedWTA = 0;
    let updatedATP = 0;
    let updatedWTA = 0;
    let errors = 0;
    
    try {
        await connectDatabases();
        
        // Traiter ATP puis WTA
        const atpResult = await updateOddsForTour('ATP');
        processedATP = atpResult.processed;
        updatedATP = atpResult.updated;
        errors += atpResult.errors;
        
        const wtaResult = await updateOddsForTour('WTA');
        processedWTA = wtaResult.processed;
        updatedWTA = wtaResult.updated;
        errors += wtaResult.errors;
        
        console.log('\n✅ MISE À JOUR DES COTES TERMINÉE');
        console.log(`📊 Résumé:`);
        console.log(`   - Cotes ATP traitées: ${processedATP}, mises à jour: ${updatedATP}`);
        console.log(`   - Cotes WTA traitées: ${processedWTA}, mises à jour: ${updatedWTA}`);
        console.log(`   - Total mis à jour: ${updatedATP + updatedWTA}`);
        console.log(`   - Erreurs: ${errors}`);
        
        // Statistiques finales
        await displayFinalStats();
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabases();
    }
}

async function updateOddsForTour(tour) {
    console.log(`\n💰 Mise à jour cotes ${tour}...`);
    
    try {
        // Récupérer toutes les cotes depuis Access (seulement ID_B_O = 2)
        const query = `
            SELECT o.ID1_O, o.ID2_O, o.ID_T_O, o.ID_R_O, o.K1, o.K2
            FROM odds_${tour.toLowerCase()} o
            WHERE o.ID_B_O = 2
        `;
        
        const odds = await accessDB.query(query);
        console.log(`  📊 ${odds.length} cotes ${tour} trouvées dans Access`);
        
        let processed = 0;
        let updated = 0;
        let errors = 0;
        let notFound = 0;
        
        const batchSize = 200;
        
        for (let i = 0; i < odds.length; i += batchSize) {
            const batch = odds.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const odd of batch) {
                    try {
                        // Trouver le match correspondant
                        const match = await findMatchForOdds(odd, tour);
                        
                        if (!match) {
                            notFound++;
                            continue;
                        }
                        
                        // Vérifier si le match a déjà des cotes
                        if (match.winner_odds && match.loser_odds) {
                            continue;
                        }
                        
                        // Calculer les cotes winner/loser
                        const oddsData = calculateWinnerLoserOdds(odd, match);
                        
                        if (!oddsData) {
                            errors++;
                            continue;
                        }
                        
                        // Mettre à jour le match avec les cotes
                        const updateResult = await pgDB.query(`
                            UPDATE matches 
                            SET winner_odds = $1, loser_odds = $2
                            WHERE id = $3 AND (winner_odds IS NULL OR loser_odds IS NULL)
                        `, [oddsData.winnerOdds, oddsData.loserOdds, match.id]);
                        
                        if (updateResult.rowCount > 0) {
                            updated++;
                        }
                        
                        processed++;
                        
                    } catch (error) {
                        errors++;
                        if (errors <= 3) {
                            console.error(`    ❌ Erreur cote ${odd.ID1_O} vs ${odd.ID2_O}:`, error.message);
                        }
                    }
                }
                
                await pgDB.query('COMMIT');
                
                // Progress reporting
                if (i % (batchSize * 5) === 0 || i + batchSize >= odds.length) {
                    const progress = Math.min(i + batchSize, odds.length);
                    const percentage = Math.round((progress / odds.length) * 100);
                    console.log(`    Progress: ${progress}/${odds.length} cotes (${percentage}%) - ${updated} mises à jour`);
                }
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                errors += batch.length;
                console.error(`    ❌ Erreur lot cotes ${i}-${i + batchSize}:`, error.message);
            }
        }
        
        console.log(`  ✅ ${processed} cotes ${tour} traitées, ${updated} matchs mis à jour (${notFound} non trouvées, ${errors} erreurs)`);
        
        return { processed, updated, errors };
        
    } catch (error) {
        console.error(`  ❌ Erreur mise à jour cotes ${tour}:`, error.message);
        return { processed: 0, updated: 0, errors: 1 };
    }
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function findMatchForOdds(odd, tour) {
    try {
        // Stratégie 1: Recherche directe par joueurs, tournoi et round
        let match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.winner_odds,
                m.loser_odds,
                pw.${tour.toLowerCase()}_id as winner_access_id,
                pl.${tour.toLowerCase()}_id as loser_access_id
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id AND pw.tour = $1
            JOIN players pl ON m.loser_id = pl.id AND pl.tour = $1
            JOIN tournaments t ON m.tournament_id = t.id AND t.${tour.toLowerCase()}_id = $2 AND t.tour = $1
            JOIN rounds r ON m.round_id = r.id AND r.atp_id = $3
            WHERE ((pw.${tour.toLowerCase()}_id = $4 AND pl.${tour.toLowerCase()}_id = $5) OR 
                   (pw.${tour.toLowerCase()}_id = $5 AND pl.${tour.toLowerCase()}_id = $4))
        `, [tour, odd.ID_T_O, odd.ID_R_O, odd.ID1_O, odd.ID2_O]);
        
        if (match.rows.length > 0) {
            return match.rows[0];
        }
        
        // Stratégie 2: Recherche sans le round
        match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.winner_odds,
                m.loser_odds,
                pw.${tour.toLowerCase()}_id as winner_access_id,
                pl.${tour.toLowerCase()}_id as loser_access_id
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id AND pw.tour = $1
            JOIN players pl ON m.loser_id = pl.id AND pl.tour = $1
            JOIN tournaments t ON m.tournament_id = t.id AND t.${tour.toLowerCase()}_id = $2 AND t.tour = $1
            WHERE ((pw.${tour.toLowerCase()}_id = $3 AND pl.${tour.toLowerCase()}_id = $4) OR 
                   (pw.${tour.toLowerCase()}_id = $4 AND pl.${tour.toLowerCase()}_id = $3))
        `, [tour, odd.ID_T_O, odd.ID1_O, odd.ID2_O]);
        
        return match.rows.length > 0 ? match.rows[0] : null;
        
    } catch (error) {
        return null;
    }
}

function calculateWinnerLoserOdds(odd, match) {
    try {
        // Vérifier la validité des cotes
        const k1 = parseFloat(odd.K1);
        const k2 = parseFloat(odd.K2);
        
        if (isNaN(k1) || isNaN(k2) || k1 <= 0 || k2 <= 0) {
            return null;
        }
        
        // Déterminer qui est ID1_O et ID2_O par rapport au winner/loser du match
        let winnerOdds, loserOdds;
        
        if (match.winner_access_id === odd.ID1_O && match.loser_access_id === odd.ID2_O) {
            // ID1_O = winner, ID2_O = loser
            winnerOdds = k1;
            loserOdds = k2;
        } else if (match.winner_access_id === odd.ID2_O && match.loser_access_id === odd.ID1_O) {
            // ID2_O = winner, ID1_O = loser
            winnerOdds = k2;
            loserOdds = k1;
        } else {
            // Cas d'erreur dans les données
            return null;
        }
        
        // Arrondir à 3 décimales
        return {
            winnerOdds: Math.round(winnerOdds * 1000) / 1000,
            loserOdds: Math.round(loserOdds * 1000) / 1000
        };
        
    } catch (error) {
        return null;
    }
}

async function displayFinalStats() {
    try {
        const stats = await pgDB.query(`
            SELECT 
                COUNT(*) as total_matches,
                COUNT(CASE WHEN winner_odds IS NOT NULL THEN 1 END) as matches_with_winner_odds,
                COUNT(CASE WHEN loser_odds IS NOT NULL THEN 1 END) as matches_with_loser_odds,
                COUNT(CASE WHEN winner_odds IS NOT NULL AND loser_odds IS NOT NULL THEN 1 END) as matches_with_both_odds,
                AVG(CASE WHEN winner_odds IS NOT NULL THEN winner_odds END) as avg_winner_odds,
                AVG(CASE WHEN loser_odds IS NOT NULL THEN loser_odds END) as avg_loser_odds,
                COUNT(CASE WHEN winner_odds > loser_odds THEN 1 END) as upsets
            FROM matches
        `);
        
        const data = stats.rows[0];
        console.log(`\n📈 Statistiques finales des cotes:`);
        console.log(`   - Total matchs: ${data.total_matches}`);
        console.log(`   - Matchs avec cotes vainqueur: ${data.matches_with_winner_odds}`);
        console.log(`   - Matchs avec cotes perdant: ${data.matches_with_loser_odds}`);
        console.log(`   - Matchs avec les deux cotes: ${data.matches_with_both_odds}`);
        
        const coverageRate = data.total_matches > 0 
            ? Math.round((data.matches_with_both_odds / data.total_matches) * 100)
            : 0;
        console.log(`   - Couverture des cotes: ${coverageRate}%`);
        
        if (data.avg_winner_odds) {
            console.log(`   - Cote moyenne vainqueur: ${parseFloat(data.avg_winner_odds).toFixed(2)}`);
            console.log(`   - Cote moyenne perdant: ${parseFloat(data.avg_loser_odds).toFixed(2)}`);
            console.log(`   - Surprises (cote vainqueur > perdant): ${data.upsets}`);
        }
        
    } catch (error) {
        console.error('Erreur affichage statistiques:', error.message);
    }
}

async function connectDatabases() {
    console.log('📡 Connexion aux bases de données...');
    
    try {
        if (accessConfig.connectionString) {
            accessDB = await odbc.connect(accessConfig.connectionString);
            console.log('  ✅ Connexion Access établie');
        } else {
            throw new Error('ACCESS_CONNECTION_STRING non configuré');
        }
        
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('  ✅ Connexion PostgreSQL établie');
        
    } catch (error) {
        throw new Error(`Échec connexion: ${error.message}`);
    }
}

async function closeDatabases() {
    if (accessDB) {
        try {
            await accessDB.close();
            console.log('📡 Connexion Access fermée');
        } catch (error) {
            console.error('Erreur fermeture Access:', error.message);
        }
    }
    
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
    updateMatchOdds().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    updateMatchOdds
};