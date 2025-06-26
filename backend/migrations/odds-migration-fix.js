// =============================================
// CORRECTION DES COTES - VERSION CORRIGÉE
// =============================================

const odbc = require('odbc');
const { Client } = require('pg');
require('dotenv').config();

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

// Statistiques
const stats = {
    oddsATP: 0,
    oddsWTA: 0,
    matchesUpdatedATP: 0,
    matchesUpdatedWTA: 0,
    correctionsATP: 0,
    correctionsWTA: 0,
    errors: 0
};

// =============================================
// FONCTION PRINCIPALE CORRIGÉE
// =============================================

async function migrateOddsCorrection() {
    console.log('🔧 MIGRATION DES COTES - VERSION CORRIGÉE');
    console.log('==========================================');
    console.log('');
    
    try {
        await connectDatabases();
        
        // Migration corrigée des cotes ATP
        await migrateOddsForTourCorrected('ATP');
        
        // Migration corrigée des cotes WTA  
        await migrateOddsForTourCorrected('WTA');
        
        // Vérification finale
        await verifyOddsResults();
        
        console.log('\n✅ MIGRATION CORRIGÉE TERMINÉE AVEC SUCCÈS !');
        
    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        process.exit(1);
    } finally {
        await closeDatabases();
    }
}

// =============================================
// CONNEXIONS
// =============================================

async function connectDatabases() {
    console.log('📡 Connexion aux bases de données...');
    
    accessDB = await odbc.connect(accessConfig.connectionString);
    console.log('  ✅ Access connecté');
    
    pgDB = new Client(pgConfig);
    await pgDB.connect();
    console.log('  ✅ PostgreSQL connecté');
}

async function closeDatabases() {
    console.log('\n🔌 Fermeture des connexions...');
    
    if (accessDB) {
        await accessDB.close();
        console.log('  ✅ Access fermé');
    }
    
    if (pgDB) {
        await pgDB.end();
        console.log('  ✅ PostgreSQL fermé');
    }
}

// =============================================
// MIGRATION CORRIGÉE PAR TOUR
// =============================================

async function migrateOddsForTourCorrected(tour) {
    console.log(`\n🔧 Migration corrigée des cotes ${tour}...`);
    
    try {
        // Récupérer toutes les cotes depuis Access (seulement ID_B_O = 2)
        const query = `
            SELECT o.ID1_O, o.ID2_O, o.ID_T_O, o.ID_R_O, o.K1, o.K2
            FROM odds_${tour.toLowerCase()} o
            WHERE o.ID_B_O = 2
        `;
        
        const odds = await accessDB.query(query);
        console.log(`  📊 ${odds.length} cotes ${tour} trouvées (ID_B_O = 2)`);
        
        let processed = 0;
        let matchesUpdated = 0;
        let corrections = 0;
        let errors = 0;
        let notFound = 0;
        
        // Traiter par batch pour optimiser
        const batchSize = 500;
        
        for (let i = 0; i < odds.length; i += batchSize) {
            const batch = odds.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const odd of batch) {
                    try {
                        // Trouver le match correspondant dans PostgreSQL
                        const match = await findMatchForOdds(odd, tour);
                        
                        if (!match) {
                            notFound++;
                            continue;
                        }
                        
                        // LOGIQUE CORRIGÉE: Calculer les cotes winner/loser
                        const oddsData = calculateWinnerLoserOddsCorrected(odd, match);
                        
                        if (!oddsData) {
                            errors++;
                            continue;
                        }
                        
                        // Déterminer si c'est une correction
                        const isCorrection = match.winner_odds !== null && match.loser_odds !== null;
                        
                        // Mettre à jour le match avec les cotes corrigées
                        const updateResult = await pgDB.query(`
                            UPDATE matches 
                            SET winner_odds = $1, loser_odds = $2, updated_at = CURRENT_TIMESTAMP
                            WHERE id = $3
                        `, [oddsData.winnerOdds, oddsData.loserOdds, match.id]);
                        
                        if (updateResult.rowCount > 0) {
                            if (isCorrection) {
                                corrections++;
                            } else {
                                matchesUpdated++;
                            }
                        }
                        
                        processed++;
                        
                    } catch (error) {
                        errors++;
                        if (errors <= 5) {
                            console.error(`    ❌ Erreur cote:`, error.message);
                        }
                    }
                }
                
                await pgDB.query('COMMIT');
                
                // Progress
                if (i % (batchSize * 4) === 0) {
                    console.log(`    Progress: ${Math.min(i + batchSize, odds.length)}/${odds.length} cotes`);
                }
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                console.error(`    ❌ Erreur batch cotes (position ${i}):`, error.message);
                errors += batch.length;
            }
        }
        
        if (tour === 'ATP') {
            stats.oddsATP = processed;
            stats.matchesUpdatedATP = matchesUpdated;
            stats.correctionsATP = corrections;
        } else {
            stats.oddsWTA = processed;
            stats.matchesUpdatedWTA = matchesUpdated;
            stats.correctionsWTA = corrections;
        }
        
        console.log(`  ✅ ${processed} cotes ${tour} traitées`);
        console.log(`  📈 ${matchesUpdated} nouveaux matchs ${tour} avec cotes`);
        console.log(`  🔧 ${corrections} corrections appliquées sur matchs ${tour} existants`);
        console.log(`  ⚠️  ${notFound} cotes sans match correspondant`);
        console.log(`  ❌ ${errors} erreurs`);
        
        // Afficher quelques exemples
        await displayOddsExamples(tour);
        
    } catch (error) {
        throw new Error(`Erreur migration corrigée cotes ${tour}: ${error.message}`);
    }
}

// =============================================
// RECHERCHE DES MATCHS CORRESPONDANTS
// =============================================

async function findMatchForOdds(odd, tour) {
    try {
        // Recherche directe par joueurs et tournoi (avec infos debug)
        let match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.winner_odds,
                m.loser_odds,
                pw.${tour.toLowerCase()}_id as winner_access_id,
                pl.${tour.toLowerCase()}_id as loser_access_id,
                pw.full_name as winner_name,
                pl.full_name as loser_name
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id AND pw.tour = $1
            JOIN players pl ON m.loser_id = pl.id AND pl.tour = $1
            JOIN tournaments t ON m.tournament_id = t.id AND t.${tour.toLowerCase()}_id = $2 AND t.tour = $1
            WHERE ((pw.${tour.toLowerCase()}_id = $3 AND pl.${tour.toLowerCase()}_id = $4) OR 
                   (pw.${tour.toLowerCase()}_id = $4 AND pl.${tour.toLowerCase()}_id = $3))
            LIMIT 1
        `, [tour, odd.ID_T_O, odd.ID1_O, odd.ID2_O]);
        
        return match.rows.length > 0 ? match.rows[0] : null;
        
    } catch (error) {
        console.error(`Erreur recherche match:`, error.message);
        return null;
    }
}

// =============================================
// CALCUL CORRIGÉ DES COTES WINNER/LOSER
// =============================================

function calculateWinnerLoserOddsCorrected(odd, match) {
    try {
        // Vérifier la validité des cotes
        const k1 = parseFloat(odd.K1);
        const k2 = parseFloat(odd.K2);
        
        if (isNaN(k1) || isNaN(k2) || k1 <= 0 || k2 <= 0) {
            return null;
        }
        
        // LOGIQUE CORRIGÉE: 
        // K1 correspond à la cote du joueur ID1_O
        // K2 correspond à la cote du joueur ID2_O
        // Il faut déterminer lequel est le winner et lequel est le loser
        
        let winnerOdds, loserOdds;
        
        if (match.winner_access_id === odd.ID1_O && match.loser_access_id === odd.ID2_O) {
            // ID1_O est le winner (donc K1 = cote du winner)
            // ID2_O est le loser (donc K2 = cote du loser)
            winnerOdds = k1;
            loserOdds = k2;
        } else if (match.winner_access_id === odd.ID2_O && match.loser_access_id === odd.ID1_O) {
            // ID2_O est le winner (donc K2 = cote du winner)
            // ID1_O est le loser (donc K1 = cote du loser)
            winnerOdds = k2;
            loserOdds = k1;
        } else {
            // Les IDs ne correspondent pas - erreur dans les données
            console.log(`  ⚠️  Mismatch IDs: Winner=${match.winner_access_id}, Loser=${match.loser_access_id}, ID1_O=${odd.ID1_O}, ID2_O=${odd.ID2_O}`);
            return null;
        }
        
        // Validation finale : le winner devrait avoir une cote plus faible que le loser (généralement)
        // Si ce n'est pas le cas, c'est soit un upset soit une erreur
        if (winnerOdds > loserOdds && (winnerOdds - loserOdds) > 2.0) {
            // Grande différence = probablement une erreur, on signale mais on continue
            console.log(`  🚨 Upset potentiel ou erreur: ${match.winner_name} (${winnerOdds}) def. ${match.loser_name} (${loserOdds})`);
        }
        
        // Arrondir à 3 décimales
        return {
            winnerOdds: Math.round(winnerOdds * 1000) / 1000,
            loserOdds: Math.round(loserOdds * 1000) / 1000
        };
        
    } catch (error) {
        console.error(`Erreur calcul cotes:`, error.message);
        return null;
    }
}

// =============================================
// AFFICHAGE D'EXEMPLES
// =============================================

async function displayOddsExamples(tour) {
    try {
        // Quelques exemples de matchs avec cotes
        const examples = await pgDB.query(`
            SELECT 
                pw.full_name as winner_name,
                pl.full_name as loser_name,
                m.winner_odds,
                m.loser_odds,
                m.score_raw,
                t.name as tournament_name,
                m.match_date
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id
            JOIN players pl ON m.loser_id = pl.id
            JOIN tournaments t ON m.tournament_id = t.id
            WHERE pw.tour = $1 
            AND m.winner_odds IS NOT NULL 
            AND m.loser_odds IS NOT NULL
            ORDER BY m.updated_at DESC
            LIMIT 3
        `, [tour]);
        
        if (examples.rows.length > 0) {
            console.log(`    🎯 Exemples récents de matchs ${tour} avec cotes:`);
            examples.rows.forEach(match => {
                const isUpset = match.winner_odds > match.loser_odds ? ' 🔥 UPSET' : '';
                console.log(`      ${match.winner_name} (${match.winner_odds}) def. ${match.loser_name} (${match.loser_odds}) ${match.score_raw} - ${match.tournament_name}${isUpset}`);
            });
        }
        
    } catch (error) {
        console.log(`    ⚠️  Erreur affichage exemples ${tour}:`, error.message);
    }
}

// =============================================
// VÉRIFICATION FINALE
// =============================================

async function verifyOddsResults() {
    console.log('\n🔍 Vérification des cotes corrigées...');
    
    try {
        // Statistiques sur les upsets après correction
        const upsetStats = await pgDB.query(`
            SELECT 
                COUNT(CASE WHEN winner_odds > loser_odds THEN 1 END) as total_upsets,
                COUNT(CASE WHEN winner_odds IS NOT NULL AND loser_odds IS NOT NULL THEN 1 END) as total_with_odds,
                COUNT(CASE WHEN winner_odds > loser_odds AND (winner_odds - loser_odds) > 2.0 THEN 1 END) as major_upsets
            FROM matches m
            WHERE winner_odds IS NOT NULL AND loser_odds IS NOT NULL
        `);
        
        if (upsetStats.rows.length > 0) {
            const data = upsetStats.rows[0];
            const upsetPercentage = data.total_with_odds > 0 ? ((data.total_upsets / data.total_with_odds) * 100).toFixed(1) : '0';
            const majorUpsetPercentage = data.total_with_odds > 0 ? ((data.major_upsets / data.total_with_odds) * 100).toFixed(1) : '0';
            
            console.log('📊 STATISTIQUES POST-CORRECTION:');
            console.log(`  🔥 Total upsets: ${data.total_upsets} (${upsetPercentage}%)`);
            console.log(`  🚨 Upsets majeurs (diff > 2.0): ${data.major_upsets} (${majorUpsetPercentage}%)`);
            console.log(`  💰 Total matchs avec cotes: ${data.total_with_odds}`);
        }
        
        // Top 5 des plus gros upsets après correction
        console.log('\n🎯 Top 5 des plus gros upsets après correction:');
        const biggestUpsets = await pgDB.query(`
            SELECT 
                pw.full_name as winner_name,
                pl.full_name as loser_name,
                m.winner_odds,
                m.loser_odds,
                (m.winner_odds - m.loser_odds) as odds_diff,
                t.name as tournament_name,
                m.match_date
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id
            JOIN players pl ON m.loser_id = pl.id
            JOIN tournaments t ON m.tournament_id = t.id
            WHERE m.winner_odds > m.loser_odds
            AND m.winner_odds IS NOT NULL 
            AND m.loser_odds IS NOT NULL
            ORDER BY (m.winner_odds - m.loser_odds) DESC
            LIMIT 5
        `);
        
        biggestUpsets.rows.forEach((upset, index) => {
            console.log(`  ${index + 1}. ${upset.winner_name} (${upset.winner_odds}) def. ${upset.loser_name} (${upset.loser_odds}) - Diff: ${upset.odds_diff.toFixed(2)} - ${upset.tournament_name}`);
        });
        
    } catch (error) {
        console.error('  ❌ Erreur vérification finale:', error.message);
    }
}

// =============================================
// EXÉCUTION
// =============================================

if (require.main === module) {
    migrateOddsCorrection().catch(error => {
        console.error('❌ ERREUR FATALE:', error);
        process.exit(1);
    });
}

module.exports = { migrateOddsCorrection };