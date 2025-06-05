// =============================================
// MIGRATION DES COTES - ODDS ATP/WTA
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
    errors: 0
};

// =============================================
// FONCTION PRINCIPALE
// =============================================

async function migrateOdds() {
    console.log('💰 MIGRATION DES COTES TENNIS');
    console.log('==============================');
    console.log('');
    
    try {
        await connectDatabases();
        
        // Migration des cotes ATP
        await migrateOddsForTour('ATP');
        
        // Migration des cotes WTA  
        await migrateOddsForTour('WTA');
        
        // Vérification finale
        await verifyOddsResults();
        
        console.log('\n✅ MIGRATION DES COTES TERMINÉE AVEC SUCCÈS !');
        
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
// MIGRATION DES COTES PAR TOUR
// =============================================

async function migrateOddsForTour(tour) {
    console.log(`\n💰 Migration des cotes ${tour}...`);
    
    try {
        // Récupérer les cotes depuis Access (seulement ID_B_O = 2)
        const query = `
            SELECT o.ID1_O, o.ID2_O, o.ID_T_O, o.ID_R_O, o.K1, o.K2
            FROM odds_${tour.toLowerCase()} o
            WHERE o.ID_B_O = 2
        `;
        
        const odds = await accessDB.query(query);
        console.log(`  📊 ${odds.length} cotes ${tour} trouvées (ID_B_O = 2)`);
        
        let processed = 0;
        let matchesUpdated = 0;
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
                        
                        // Déterminer les cotes winner/loser en fonction de qui a gagné
                        const oddsData = calculateWinnerLoserOdds(odd, match);
                        
                        if (!oddsData) {
                            errors++;
                            continue;
                        }
                        
                        // Mettre à jour le match avec les cotes
                        const updateResult = await pgDB.query(`
                            UPDATE matches 
                            SET winner_odds = $1, loser_odds = $2, updated_at = CURRENT_TIMESTAMP
                            WHERE id = $3 AND (winner_odds IS NULL OR loser_odds IS NULL)
                        `, [oddsData.winnerOdds, oddsData.loserOdds, match.id]);
                        
                        if (updateResult.rowCount > 0) {
                            matchesUpdated++;
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
        } else {
            stats.oddsWTA = processed;
            stats.matchesUpdatedWTA = matchesUpdated;
        }
        
        console.log(`  ✅ ${processed} cotes ${tour} traitées`);
        console.log(`  📈 ${matchesUpdated} matchs ${tour} mis à jour avec cotes`);
        console.log(`  ⚠️  ${notFound} cotes sans match correspondant`);
        console.log(`  ❌ ${errors} erreurs`);
        
        // Afficher quelques exemples
        await displayOddsExamples(tour);
        
    } catch (error) {
        throw new Error(`Erreur migration cotes ${tour}: ${error.message}`);
    }
}

// =============================================
// RECHERCHE DES MATCHS CORRESPONDANTS
// =============================================

async function findMatchForOdds(odd, tour) {
    try {
        // Stratégie 1: Recherche directe par joueurs, tournoi et round
        let match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
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
        
        // Stratégie 2: Recherche sans le round (au cas où il y aurait des incohérences)
        match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
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
        console.error(`Erreur recherche match:`, error.message);
        return null;
    }
}

// =============================================
// CALCUL DES COTES WINNER/LOSER
// =============================================

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
            ORDER BY m.match_date DESC
            LIMIT 3
        `, [tour]);
        
        if (examples.rows.length > 0) {
            console.log(`    🎯 Exemples de matchs ${tour} avec cotes:`);
            examples.rows.forEach(match => {
                console.log(`      ${match.winner_name} (${match.winner_odds}) def. ${match.loser_name} (${match.loser_odds}) ${match.score_raw} - ${match.tournament_name}`);
            });
        }
        
        // Statistiques des cotes
        const oddsStats = await pgDB.query(`
            SELECT 
                COUNT(CASE WHEN winner_odds IS NOT NULL AND loser_odds IS NOT NULL THEN 1 END) as matches_with_odds,
                COUNT(*) as total_matches,
                MIN(winner_odds) as min_winner_odds,
                MAX(winner_odds) as max_winner_odds,
                AVG(winner_odds) as avg_winner_odds,
                MIN(loser_odds) as min_loser_odds,
                MAX(loser_odds) as max_loser_odds,
                AVG(loser_odds) as avg_loser_odds
            FROM matches m
            JOIN players p ON m.winner_id = p.id
            WHERE p.tour = $1
        `, [tour]);
        
        if (oddsStats.rows.length > 0) {
            const data = oddsStats.rows[0];
            const percentage = ((data.matches_with_odds / data.total_matches) * 100).toFixed(1);
            
            console.log(`    📊 Couverture: ${data.matches_with_odds}/${data.total_matches} matchs (${percentage}%)`);
            console.log(`    📈 Cotes moyennes: Winner ${parseFloat(data.avg_winner_odds).toFixed(2)}, Loser ${parseFloat(data.avg_loser_odds).toFixed(2)}`);
        }
        
    } catch (error) {
        console.log(`    ⚠️  Erreur affichage exemples ${tour}:`, error.message);
    }
}

// =============================================
// VÉRIFICATION FINALE
// =============================================

async function verifyOddsResults() {
    console.log('\n🔍 Vérification des cotes...');
    
    try {
        // Statistiques globales
        const globalStats = await pgDB.query(`
            SELECT 
                COUNT(CASE WHEN winner_odds IS NOT NULL AND loser_odds IS NOT NULL THEN 1 END) as total_matches_with_odds,
                COUNT(*) as total_matches,
                COUNT(CASE WHEN winner_odds IS NOT NULL AND loser_odds IS NOT NULL AND p.tour = 'ATP' THEN 1 END) as atp_matches_with_odds,
                COUNT(CASE WHEN winner_odds IS NOT NULL AND loser_odds IS NOT NULL AND p.tour = 'WTA' THEN 1 END) as wta_matches_with_odds,
                COUNT(CASE WHEN p.tour = 'ATP' THEN 1 END) as total_atp_matches,
                COUNT(CASE WHEN p.tour = 'WTA' THEN 1 END) as total_wta_matches
            FROM matches m
            JOIN players p ON m.winner_id = p.id
        `);
        
        if (globalStats.rows.length > 0) {
            const data = globalStats.rows[0];
            const totalPercentage = ((data.total_matches_with_odds / data.total_matches) * 100).toFixed(1);
            const atpPercentage = data.total_atp_matches > 0 ? ((data.atp_matches_with_odds / data.total_atp_matches) * 100).toFixed(1) : '0';
            const wtaPercentage = data.total_wta_matches > 0 ? ((data.wta_matches_with_odds / data.total_wta_matches) * 100).toFixed(1) : '0';
            
            console.log('📊 STATISTIQUES FINALES DES COTES:');
            console.log(`  💰 Total matchs avec cotes: ${data.total_matches_with_odds.toLocaleString()}`);
            console.log(`  📈 Couverture globale: ${totalPercentage}%`);
            console.log(`  🎾 ATP: ${data.atp_matches_with_odds.toLocaleString()}/${data.total_atp_matches.toLocaleString()} matchs (${atpPercentage}%)`);
            console.log(`  🎾 WTA: ${data.wta_matches_with_odds.toLocaleString()}/${data.total_wta_matches.toLocaleString()} matchs (${wtaPercentage}%)`);
        }
        
        // Quelques statistiques intéressantes
        const interestingStats = await pgDB.query(`
            SELECT 
                COUNT(CASE WHEN winner_odds > loser_odds THEN 1 END) as upsets,
                COUNT(CASE WHEN winner_odds IS NOT NULL AND loser_odds IS NOT NULL THEN 1 END) as total_with_odds,
                MIN(winner_odds) as lowest_winner_odds,
                MAX(loser_odds) as highest_loser_odds
            FROM matches m
            WHERE winner_odds IS NOT NULL AND loser_odds IS NOT NULL
        `);
        
        if (interestingStats.rows.length > 0) {
            const data = interestingStats.rows[0];
            const upsetPercentage = data.total_with_odds > 0 ? ((data.upsets / data.total_with_odds) * 100).toFixed(1) : '0';
            
            console.log('\n📈 ANALYSES INTÉRESSANTES:');
            console.log(`  🔥 Upsets (favori battu): ${data.upsets.toLocaleString()} (${upsetPercentage}%)`);
            console.log(`  🏆 Plus petit odds vainqueur: ${data.lowest_winner_odds}`);
            console.log(`  😱 Plus gros odds perdant: ${data.highest_loser_odds}`);
        }
        
        // Top 5 des plus gros upsets
        console.log('\n🎯 Top 5 des plus gros upsets (odds vainqueur > odds perdant):');
        const biggestUpsets = await pgDB.query(`
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
            WHERE m.winner_odds > m.loser_odds
            AND m.winner_odds IS NOT NULL 
            AND m.loser_odds IS NOT NULL
            ORDER BY (m.winner_odds - m.loser_odds) DESC
            LIMIT 5
        `);
        
        biggestUpsets.rows.forEach((upset, index) => {
            console.log(`  ${index + 1}. ${upset.winner_name} (${upset.winner_odds}) def. ${upset.loser_name} (${upset.loser_odds}) - ${upset.tournament_name} (${upset.match_date})`);
        });
        
    } catch (error) {
        console.error('  ❌ Erreur vérification cotes:', error.message);
    }
}

// =============================================
// EXÉCUTION
// =============================================

if (require.main === module) {
    migrateOdds().catch(error => {
        console.error('❌ ERREUR FATALE:', error);
        process.exit(1);
    });
}

module.exports = { migrateOdds };