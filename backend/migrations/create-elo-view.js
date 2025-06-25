// =============================================
// CRÉATION DE LA VUE DE CLASSEMENT ELO ACTUEL
// =============================================

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
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

async function createEloRankingView() {
    console.log('\n🎾 CRÉATION DE LA VUE CLASSEMENT ELO ACTUEL');
    console.log('==========================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    try {
        await connectDatabase();
        
        // Lire le fichier SQL
        console.log('📂 Lecture du fichier SQL...');
        const sqlFilePath = path.join(__dirname, 'create-elo-ranking-view.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        
        // Exécuter le script SQL
        console.log('🔄 Création de la vue...');
        await pgDB.query(sqlContent);
        
        console.log('✅ Vue "current_elo_rankings" créée avec succès');
        
        // Tester la vue
        await testView();
        
        // Afficher des statistiques
        await displayViewStats();
        
        console.log('\n✅ CRÉATION DE LA VUE TERMINÉE');
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabase();
    }
}

// =============================================
// FONCTIONS DE TEST ET STATISTIQUES
// =============================================

async function testView() {
    try {
        console.log('\n🧪 Test de la vue...');
        
        // Test basique - compter les lignes
        const countResult = await pgDB.query('SELECT COUNT(*) as total FROM current_elo_rankings');
        const totalPlayers = countResult.rows[0].total;
        
        console.log(`   - Total joueurs avec ELO: ${totalPlayers}`);
        
        if (totalPlayers > 0) {
            // Top 5 ELO général
            const top5Result = await pgDB.query(`
                SELECT 
                    overall_rank,
                    player_name,
                    tour,
                    elo_general,
                    activity_status,
                    days_since_last_match
                FROM current_elo_rankings 
                ORDER BY elo_general DESC 
                LIMIT 5
            `);
            
            console.log('   🏆 Top 5 ELO général:');
            top5Result.rows.forEach(player => {
                console.log(`      ${player.overall_rank}. ${player.player_name} (${player.tour}) - ${player.elo_general} ELO - ${player.activity_status}`);
            });
        }
        
    } catch (error) {
        console.error('Erreur test vue:', error.message);
    }
}

async function displayViewStats() {
    try {
        console.log('\n📊 Statistiques de la vue:');
        
        // Statistiques par tour
        const tourStatsResult = await pgDB.query(`
            SELECT 
                tour,
                COUNT(*) as total_players,
                ROUND(AVG(elo_general)) as avg_elo,
                MIN(elo_general) as min_elo,
                MAX(elo_general) as max_elo,
                ROUND(AVG(matches_12m)) as avg_matches_12m,
                MIN(matches_12m) as min_matches_12m,
                MAX(matches_12m) as max_matches_12m,
                COUNT(CASE WHEN activity_status = 'Actif' THEN 1 END) as active_players,
                COUNT(CASE WHEN activity_status = 'Peu actif' THEN 1 END) as somewhat_active,
                COUNT(CASE WHEN activity_status = 'Inactif' THEN 1 END) as inactive_players,
                COUNT(CASE WHEN activity_status = 'Très inactif' THEN 1 END) as very_inactive
            FROM current_elo_rankings 
            GROUP BY tour 
            ORDER BY tour
        `);
        
        tourStatsResult.rows.forEach(stat => {
            console.log(`\n   🎾 Tour ${stat.tour}:`);
            console.log(`      - Joueurs total: ${stat.total_players}`);
            console.log(`      - ELO moyen: ${stat.avg_elo}`);
            console.log(`      - ELO range: ${stat.min_elo} - ${stat.max_elo}`);
            console.log(`      - Matchs 12m moyen: ${stat.avg_matches_12m}`);
            console.log(`      - Matchs 12m range: ${stat.min_matches_12m} - ${stat.max_matches_12m}`);
            console.log(`      - Actifs: ${stat.active_players}`);
            console.log(`      - Peu actifs: ${stat.somewhat_active}`);
            console.log(`      - Inactifs: ${stat.inactive_players}`);
            console.log(`      - Très inactifs: ${stat.very_inactive}`);
        });
        
        // Statistiques surfaces
        const surfaceStatsResult = await pgDB.query(`
            SELECT 
                'Clay' as surface,
                AVG(elo_clay) as avg_elo,
                MIN(elo_clay) as min_elo,
                MAX(elo_clay) as max_elo,
                COUNT(elo_clay) as players_with_elo
            FROM current_elo_rankings WHERE elo_clay IS NOT NULL
            UNION ALL
            SELECT 
                'Grass' as surface,
                AVG(elo_grass) as avg_elo,
                MIN(elo_grass) as min_elo,
                MAX(elo_grass) as max_elo,
                COUNT(elo_grass) as players_with_elo
            FROM current_elo_rankings WHERE elo_grass IS NOT NULL
            UNION ALL
            SELECT 
                'Hard' as surface,
                AVG(elo_hard) as avg_elo,
                MIN(elo_hard) as min_elo,
                MAX(elo_hard) as max_elo,
                COUNT(elo_hard) as players_with_elo
            FROM current_elo_rankings WHERE elo_hard IS NOT NULL
            UNION ALL
            SELECT 
                'Indoor Hard' as surface,
                AVG(elo_ihard) as avg_elo,
                MIN(elo_ihard) as min_elo,
                MAX(elo_ihard) as max_elo,
                COUNT(elo_ihard) as players_with_elo
            FROM current_elo_rankings WHERE elo_ihard IS NOT NULL
            ORDER BY surface
        `);
        
        console.log(`\n   🏟️ Statistiques par surface:`);
        surfaceStatsResult.rows.forEach(stat => {
            console.log(`      - ${stat.surface}: ${stat.players_with_elo} joueurs, ELO moyen: ${Math.round(stat.avg_elo)}`);
        });
        
    } catch (error) {
        console.error('Erreur statistiques vue:', error.message);
    }
}

// =============================================
// EXEMPLES D'UTILISATION
// =============================================

async function showUsageExamples() {
    console.log('\n📖 EXEMPLES D\'UTILISATION DE LA VUE:');
    
    console.log('\n1. Top 10 mondial ELO général:');
    console.log(`   SELECT player_name, tour, elo_general, activity_status 
   FROM current_elo_rankings 
   ORDER BY elo_general DESC 
   LIMIT 10;`);
    
    console.log('\n2. Classement ATP seul:');
    console.log(`   SELECT rank_in_tour, player_name, elo_general, country_code
   FROM current_elo_rankings 
   WHERE tour = 'ATP' 
   ORDER BY elo_general DESC;`);
    
    console.log('\n3. Joueurs actifs avec ELO clay > 1400:');
    console.log(`   SELECT player_name, elo_clay, last_match_date
   FROM current_elo_rankings 
   WHERE activity_status = 'Actif' 
     AND elo_clay > 1400
   ORDER BY elo_clay DESC;`);
    
    console.log('\n4. Comparaison ELO officiel vs classement:');
    console.log(`   SELECT player_name, elo_general, official_ranking, official_points
   FROM current_elo_rankings 
   WHERE official_ranking IS NOT NULL
   ORDER BY elo_general DESC;`);
}

// =============================================
// UTILITAIRES BASE DE DONNÉES
// =============================================

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
    createEloRankingView().then(async () => {
        await showUsageExamples();
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    createEloRankingView
};