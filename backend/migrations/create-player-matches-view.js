// =============================================
// CRÉATION DE LA VUE POUR LES MATCHS DÉTAILLÉS D'UN JOUEUR
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

async function createPlayerMatchesView() {
    console.log('\n🎾 CRÉATION DE LA VUE MATCHS DÉTAILLÉS PAR JOUEUR');
    console.log('=================================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    try {
        await connectDatabase();
        
        // Lire le fichier SQL
        console.log('📂 Lecture du fichier SQL...');
        const sqlFilePath = path.join(__dirname, 'create-player-matches-view.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        
        // Exécuter le script SQL
        console.log('🔄 Création de la vue...');
        await pgDB.query(sqlContent);
        
        console.log('✅ Vue "player_matches_detailed" créée avec succès');
        
        // Tester la vue avec le joueur 5061
        await testViewWithPlayer5061();
        
        console.log('\n✅ CRÉATION DE LA VUE TERMINÉE');
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabase();
    }
}

// =============================================
// FONCTIONS DE TEST
// =============================================

async function testViewWithPlayer5061() {
    try {
        console.log('\n🧪 Test de la vue avec le joueur 5061...');
        
        // Vérifier le nom du joueur
        const playerResult = await pgDB.query(`
            SELECT full_name, tour 
            FROM players 
            WHERE id = 5061
        `);
        
        if (playerResult.rows.length === 0) {
            console.log('   ⚠️  Joueur 5061 non trouvé');
            return;
        }
        
        const playerInfo = playerResult.rows[0];
        console.log(`   👤 Joueur: ${playerInfo.full_name} (${playerInfo.tour})`);
        
        // Compter le nombre total de matchs
        const countResult = await pgDB.query(`
            SELECT COUNT(*) as total_matches 
            FROM player_matches_detailed 
            WHERE player_id = 5061
        `);
        
        const totalMatches = countResult.rows[0].total_matches;
        console.log(`   📊 Total matchs: ${totalMatches}`);
        
        if (totalMatches > 0) {
            // Afficher les 5 derniers matchs
            const recentMatchesResult = await pgDB.query(`
                SELECT 
                    match_date,
                    opponent_name,
                    result,
                    score,
                    player_ranking,
                    opponent_ranking,
                    player_elo_general,
                    opponent_elo_general,
                    tournament_name,
                    surface
                FROM player_matches_detailed 
                WHERE player_id = 5061 
                ORDER BY match_date DESC 
                LIMIT 5
            `);
            
            console.log('\n   🏆 5 derniers matchs:');
            recentMatchesResult.rows.forEach((match, index) => {
                const date = match.match_date || 'Date inconnue';
                const opponent = match.opponent_name || 'Adversaire inconnu';
                const result = match.result;
                const score = match.score || 'Score inconnu';
                const playerRank = match.player_ranking ? `#${match.player_ranking}` : 'NR';
                const oppRank = match.opponent_ranking ? `#${match.opponent_ranking}` : 'NR';
                const playerElo = match.player_elo_general || 'N/A';
                const oppElo = match.opponent_elo_general || 'N/A';
                const tournament = match.tournament_name || 'Tournoi inconnu';
                const surface = match.surface || 'Surface inconnue';
                
                console.log(`      ${index + 1}. ${date} - ${result} vs ${opponent}`);
                console.log(`         Score: ${score} | Tournoi: ${tournament} (${surface})`);
                console.log(`         Rankings: ${playerRank} vs ${oppRank} | ELO: ${playerElo} vs ${oppElo}`);
            });
            
            // Statistiques par résultat
            const statsResult = await pgDB.query(`
                SELECT 
                    result,
                    COUNT(*) as count
                FROM player_matches_detailed 
                WHERE player_id = 5061 
                GROUP BY result
                ORDER BY count DESC
            `);
            
            console.log('\n   📈 Statistiques:');
            let totalWins = 0, totalLosses = 0;
            statsResult.rows.forEach(stat => {
                console.log(`      - ${stat.result}: ${stat.count} matchs`);
                if (stat.result === 'Victoire') totalWins = parseInt(stat.count);
                if (stat.result === 'Défaite') totalLosses = parseInt(stat.count);
            });
            
            if (totalWins + totalLosses > 0) {
                const winRate = Math.round((totalWins / (totalWins + totalLosses)) * 100);
                console.log(`      - Taux de victoire: ${winRate}%`);
            }
        }
        
    } catch (error) {
        console.error('Erreur test vue:', error.message);
    }
}

// =============================================
// EXEMPLES D'UTILISATION
// =============================================

async function showUsageExamples() {
    console.log('\n📖 EXEMPLES D\'UTILISATION DE LA VUE:');
    
    console.log('\n1. Tous les matchs du joueur 5061 :');
    console.log(`   SELECT * FROM player_matches_detailed WHERE player_id = 5061;`);
    
    console.log('\n2. 10 derniers matchs avec détails :');
    console.log(`   SELECT 
       match_date, opponent_name, result, score,
       player_ranking, opponent_ranking,
       player_elo_general, opponent_elo_general,
       tournament_name, surface
   FROM player_matches_detailed 
   WHERE player_id = 5061 
   ORDER BY match_date DESC LIMIT 10;`);
    
    console.log('\n3. Victoires en 2024 :');
    console.log(`   SELECT match_date, opponent_name, score, tournament_name
   FROM player_matches_detailed 
   WHERE player_id = 5061 
     AND result = 'Victoire'
     AND EXTRACT(YEAR FROM match_date::DATE) = 2024
   ORDER BY match_date DESC;`);
    
    console.log('\n4. Statistiques par surface :');
    console.log(`   SELECT 
       surface,
       COUNT(*) as total_matches,
       COUNT(CASE WHEN result = 'Victoire' THEN 1 END) as wins,
       ROUND(COUNT(CASE WHEN result = 'Victoire' THEN 1 END) * 100.0 / COUNT(*), 1) as win_rate
   FROM player_matches_detailed 
   WHERE player_id = 5061
   GROUP BY surface;`);
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
    createPlayerMatchesView().then(async () => {
        await showUsageExamples();
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    createPlayerMatchesView
};