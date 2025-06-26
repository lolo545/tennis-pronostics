// =============================================
// MIGRATION DES COTES - VERSION DEBUG
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

// Statistiques de debug
const debugStats = {
    totalOdds: 0,
    correctMappings: 0,
    inversions: 0,
    unmatchedOdds: 0,
    invalidOdds: 0,
    examples: []
};

// =============================================
// FONCTION PRINCIPALE DE DEBUG
// =============================================

async function debugOddsMigration() {
    console.log('🔍 DEBUG MIGRATION DES COTES TENNIS');
    console.log('=====================================');
    console.log('');
    
    try {
        await connectDatabases();
        
        // Analyser ATP et WTA
        await debugOddsForTour('ATP');
        await debugOddsForTour('WTA');
        
        // Rapport final
        await generateDebugReport();
        
        console.log('\n✅ ANALYSE DEBUG TERMINÉE !');
        
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
// DEBUG PAR TOUR
// =============================================

async function debugOddsForTour(tour) {
    console.log(`\n🔍 Debug des cotes ${tour}...`);
    
    try {
        // Récupérer un échantillon de cotes depuis Access
        const query = `
            SELECT TOP 200 o.ID1_O, o.ID2_O, o.ID_T_O, o.ID_R_O, o.K1, o.K2
            FROM odds_${tour.toLowerCase()} o
            WHERE o.ID_B_O = 2 AND o.K1 IS NOT NULL AND o.K2 IS NOT NULL
            ORDER BY o.ID_T_O DESC
        `;
        
        const odds = await accessDB.query(query);
        console.log(`  📊 ${odds.length} cotes ${tour} analysées`);
        
        let correctMappings = 0;
        let inversions = 0;
        let unmatchedOdds = 0;
        let invalidOdds = 0;
        
        // Analyser chaque cote
        for (const odd of odds) {
            debugStats.totalOdds++;
            
            try {
                // Vérifier la validité des cotes
                const k1 = parseFloat(odd.K1);
                const k2 = parseFloat(odd.K2);
                
                if (isNaN(k1) || isNaN(k2) || k1 <= 0 || k2 <= 0) {
                    invalidOdds++;
                    debugStats.invalidOdds++;
                    continue;
                }
                
                // Trouver le match correspondant
                const match = await findMatchForOddsDebug(odd, tour);
                
                if (!match) {
                    unmatchedOdds++;
                    debugStats.unmatchedOdds++;
                    continue;
                }
                
                // Analyser le mapping
                const analysis = analyzeOddsMapping(odd, match);
                
                if (analysis.isCorrect) {
                    correctMappings++;
                    debugStats.correctMappings++;
                } else if (analysis.isInverted) {
                    inversions++;
                    debugStats.inversions++;
                    
                    // Ajouter aux exemples d'inversion
                    debugStats.examples.push({
                        tour,
                        tournament: match.tournament_name,
                        winner: match.winner_name,
                        loser: match.loser_name,
                        id1_o: odd.ID1_O,
                        id2_o: odd.ID2_O,
                        k1: k1,
                        k2: k2,
                        winner_access_id: match.winner_access_id,
                        loser_access_id: match.loser_access_id,
                        current_winner_odds: match.winner_odds,
                        current_loser_odds: match.loser_odds,
                        expected_winner_odds: analysis.expectedWinnerOdds,
                        expected_loser_odds: analysis.expectedLoserOdds,
                        problem: analysis.problem
                    });
                }
                
                // Afficher les premiers cas problématiques
                if (inversions <= 5 && analysis.isInverted) {
                    console.log(`    ❌ INVERSION DÉTECTÉE:`);
                    console.log(`       Match: ${match.winner_name} def. ${match.loser_name}`);
                    console.log(`       Access: ID1_O=${odd.ID1_O} (K1=${k1}), ID2_O=${odd.ID2_O} (K2=${k2})`);
                    console.log(`       PostgreSQL: Winner=${match.winner_access_id}, Loser=${match.loser_access_id}`);
                    console.log(`       Actuellement: Winner_odds=${match.winner_odds}, Loser_odds=${match.loser_odds}`);
                    console.log(`       Devrait être: Winner_odds=${analysis.expectedWinnerOdds}, Loser_odds=${analysis.expectedLoserOdds}`);
                }
                
            } catch (error) {
                console.error(`    ❌ Erreur analyse cote:`, error.message);
            }
        }
        
        console.log(`  ✅ Mappings corrects: ${correctMappings}`);
        console.log(`  🔄 Inversions détectées: ${inversions}`);
        console.log(`  ❓ Cotes non matchées: ${unmatchedOdds}`);
        console.log(`  ❌ Cotes invalides: ${invalidOdds}`);
        
        // Pourcentage d'erreur
        const totalValid = correctMappings + inversions;
        if (totalValid > 0) {
            const errorRate = ((inversions / totalValid) * 100).toFixed(1);
            console.log(`  📊 Taux d'inversion: ${errorRate}%`);
        }
        
    } catch (error) {
        throw new Error(`Erreur debug cotes ${tour}: ${error.message}`);
    }
}

// =============================================
// RECHERCHE DE MATCH AVEC DEBUG
// =============================================

async function findMatchForOddsDebug(odd, tour) {
    try {
        // Recherche avec informations détaillées pour debug
        const match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.winner_odds,
                m.loser_odds,
                pw.${tour.toLowerCase()}_id as winner_access_id,
                pl.${tour.toLowerCase()}_id as loser_access_id,
                pw.full_name as winner_name,
                pl.full_name as loser_name,
                t.name as tournament_name,
                r.name as round_name
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id AND pw.tour = $1
            JOIN players pl ON m.loser_id = pl.id AND pl.tour = $1
            JOIN tournaments t ON m.tournament_id = t.id AND t.${tour.toLowerCase()}_id = $2 AND t.tour = $1
            LEFT JOIN rounds r ON m.round_id = r.id
            WHERE ((pw.${tour.toLowerCase()}_id = $3 AND pl.${tour.toLowerCase()}_id = $4) OR 
                   (pw.${tour.toLowerCase()}_id = $4 AND pl.${tour.toLowerCase()}_id = $3))
            LIMIT 1
        `, [tour, odd.ID_T_O, odd.ID1_O, odd.ID2_O]);
        
        return match.rows.length > 0 ? match.rows[0] : null;
        
    } catch (error) {
        console.error(`Erreur recherche match debug:`, error.message);
        return null;
    }
}

// =============================================
// ANALYSE DU MAPPING DES COTES
// =============================================

function analyzeOddsMapping(odd, match) {
    const k1 = parseFloat(odd.K1);
    const k2 = parseFloat(odd.K2);
    
    // Cas 1: ID1_O correspond au winner, ID2_O au loser
    if (match.winner_access_id === odd.ID1_O && match.loser_access_id === odd.ID2_O) {
        return {
            isCorrect: true,
            isInverted: false,
            expectedWinnerOdds: k1,
            expectedLoserOdds: k2,
            problem: null
        };
    }
    
    // Cas 2: ID2_O correspond au winner, ID1_O au loser (ordre inversé)
    if (match.winner_access_id === odd.ID2_O && match.loser_access_id === odd.ID1_O) {
        return {
            isCorrect: true,
            isInverted: false,
            expectedWinnerOdds: k2,
            expectedLoserOdds: k1,
            problem: null
        };
    }
    
    // Cas 3: Problème de mapping
    return {
        isCorrect: false,
        isInverted: true,
        expectedWinnerOdds: null,
        expectedLoserOdds: null,
        problem: `Winner_access_id=${match.winner_access_id}, Loser_access_id=${match.loser_access_id}, mais ID1_O=${odd.ID1_O}, ID2_O=${odd.ID2_O}`
    };
}

// =============================================
// RAPPORT FINAL
// =============================================

async function generateDebugReport() {
    console.log('\n📊 RAPPORT DEBUG FINAL');
    console.log('======================');
    
    console.log(`📈 Total cotes analysées: ${debugStats.totalOdds}`);
    console.log(`✅ Mappings corrects: ${debugStats.correctMappings}`);
    console.log(`🔄 Inversions détectées: ${debugStats.inversions}`);
    console.log(`❓ Cotes non matchées: ${debugStats.unmatchedOdds}`);
    console.log(`❌ Cotes invalides: ${debugStats.invalidOdds}`);
    
    const totalValid = debugStats.correctMappings + debugStats.inversions;
    if (totalValid > 0) {
        const errorRate = ((debugStats.inversions / totalValid) * 100).toFixed(1);
        console.log(`📊 Taux d'inversion global: ${errorRate}%`);
    }
    
    // Exemples d'inversions les plus flagrantes
    if (debugStats.examples.length > 0) {
        console.log('\n🔍 EXEMPLES D\'INVERSIONS DÉTECTÉES:');
        debugStats.examples.slice(0, 10).forEach((example, index) => {
            console.log(`\n${index + 1}. ${example.tour} - ${example.tournament}`);
            console.log(`   Match: ${example.winner} def. ${example.loser}`);
            console.log(`   Access: ID1_O=${example.id1_o} (K1=${example.k1}), ID2_O=${example.id2_o} (K2=${example.k2})`);
            console.log(`   PostgreSQL: Winner_ID=${example.winner_access_id}, Loser_ID=${example.loser_access_id}`);
            console.log(`   Actuellement: Winner=${example.current_winner_odds}, Loser=${example.current_loser_odds}`);
            console.log(`   Problème: ${example.problem}`);
        });
    }
    
    // Vérifier les cotes actuelles dans PostgreSQL
    console.log('\n🔍 VÉRIFICATION COTES ACTUELLES:');
    await checkCurrentOddsInDatabase();
}

// =============================================
// VÉRIFICATION DES COTES ACTUELLES
// =============================================

async function checkCurrentOddsInDatabase() {
    try {
        // Statistiques des cotes suspectes (winner_odds > loser_odds = upset potentiel)
        const suspiciousOdds = await pgDB.query(`
            SELECT COUNT(*) as suspicious_count
            FROM matches m
            WHERE m.winner_odds > m.loser_odds
            AND m.winner_odds IS NOT NULL 
            AND m.loser_odds IS NOT NULL
        `);
        
        console.log(`  🚨 Matchs suspects (winner_odds > loser_odds): ${suspiciousOdds.rows[0].suspicious_count}`);
        
        // Quelques exemples de cotes les plus suspectes
        const examples = await pgDB.query(`
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
        
        if (examples.rows.length > 0) {
            console.log('\n  📋 Top 5 des cotes les plus suspectes:');
            examples.rows.forEach((match, index) => {
                console.log(`    ${index + 1}. ${match.winner_name} (${match.winner_odds}) def. ${match.loser_name} (${match.loser_odds}) - Diff: ${match.odds_diff.toFixed(2)}`);
            });
        }
        
    } catch (error) {
        console.error('  ❌ Erreur vérification cotes actuelles:', error.message);
    }
}

// =============================================
// EXÉCUTION
// =============================================

if (require.main === module) {
    debugOddsMigration().catch(error => {
        console.error('❌ ERREUR FATALE:', error);
        process.exit(1);
    });
}

module.exports = { debugOddsMigration };