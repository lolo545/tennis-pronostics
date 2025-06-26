// Test simple de l'API ELO pour déboguer l'erreur 500
const { Client } = require('pg');
require('dotenv').config();

const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'tennis_pronostics',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD
};

async function testEloAPI() {
    const client = new Client(pgConfig);
    
    try {
        console.log('🔌 Connexion à PostgreSQL...');
        await client.connect();
        console.log('✅ Connexion réussie');
        
        // Test 1: Vérifier l'existence du joueur
        console.log('\n🔍 Test 1: Vérifier l\'existence du joueur 25105...');
        const playerResult = await client.query('SELECT id, full_name, tour FROM players WHERE id = $1', [25105]);
        
        if (playerResult.rows.length === 0) {
            console.log('❌ Joueur 25105 non trouvé');
            return;
        }
        
        console.log('✅ Joueur trouvé:', playerResult.rows[0]);
        
        // Test 2: Vérifier les colonnes ELO
        console.log('\n🔍 Test 2: Vérifier les colonnes ELO...');
        const columnsResult = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'matches' 
            AND column_name LIKE '%elo%'
            ORDER BY column_name
        `);
        
        console.log('📊 Colonnes ELO disponibles:', columnsResult.rows.map(r => r.column_name));
        
        // Test 3: Compter les matchs avec ELO
        console.log('\n🔍 Test 3: Compter les matchs avec ELO...');
        const countResult = await client.query(`
            SELECT 
                COUNT(*) as total_matches,
                COUNT(CASE WHEN winner_elo IS NOT NULL THEN 1 END) as matches_with_elo
            FROM matches
        `);
        
        console.log('📈 Stats matchs:', countResult.rows[0]);
        
        // Test 4: Tester la requête ELO pour le joueur 25105
        console.log('\n🔍 Test 4: Chercher des matchs ELO pour le joueur 25105...');
        const playerEloResult = await client.query(`
            SELECT 
                COUNT(*) as total_matches,
                COUNT(CASE WHEN winner_elo IS NOT NULL AND loser_elo IS NOT NULL THEN 1 END) as matches_with_elo
            FROM matches m
            WHERE (m.winner_id = $1 OR m.loser_id = $1)
        `, [25105]);
        
        console.log('🎾 Matchs du joueur 25105:', playerEloResult.rows[0]);
        
        // Test 5: Échantillon de données ELO
        console.log('\n🔍 Test 5: Échantillon de données ELO...');
        const sampleResult = await client.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.winner_elo,
                m.loser_elo
            FROM matches m
            WHERE m.winner_elo IS NOT NULL 
            AND m.loser_elo IS NOT NULL
            LIMIT 5
        `);
        
        console.log('📋 Échantillon ELO:', sampleResult.rows);
        
        // Test 6: Tester la requête ELO simplifiée
        console.log('\n🔍 Test 6: Test requête ELO simplifiée...');
        const simpleEloQuery = `
            SELECT 
                COUNT(*) as total_matches,
                COUNT(CASE WHEN m.winner_id = $1 THEN 1 END) as wins
            FROM matches m
            WHERE (m.winner_id = $1 OR m.loser_id = $1)
              AND m.winner_elo IS NOT NULL 
              AND m.loser_elo IS NOT NULL
        `;
        
        const simpleResult = await client.query(simpleEloQuery, [25105]);
        console.log('🎯 Résultat simple:', simpleResult.rows[0]);
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        console.error('💡 Stack:', error.stack);
    } finally {
        await client.end();
    }
}

// Exécuter le test
testEloAPI().then(() => {
    console.log('\n✅ Test terminé');
    process.exit(0);
}).catch((error) => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
});