// Test simple pour vérifier la table today_matches
const { Client } = require('pg');
require('dotenv').config();

const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'tennis_pronostics',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD
};

async function testTodayMatches() {
    console.log('🧪 Test de la table today_matches...');
    
    let pgDB = null;
    
    try {
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('✅ Connexion PostgreSQL établie');
        
        // Vérifier si la table existe
        const tableCheck = await pgDB.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'today_matches'
        `);
        
        if (tableCheck.rows.length === 0) {
            console.log('❌ Table today_matches n\'existe pas');
            console.log('💡 Lancez d\'abord: npm run create:today-matches-table');
            return;
        }
        
        console.log('✅ Table today_matches existe');
        
        // Compter les matchs du jour
        const countQuery = `
            SELECT 
                tour,
                COUNT(*) as count,
                MIN(match_datetime) as earliest_match,
                MAX(match_datetime) as latest_match
            FROM today_matches 
            GROUP BY tour
            ORDER BY tour
        `;
        
        const counts = await pgDB.query(countQuery);
        
        if (counts.rows.length === 0) {
            console.log('📊 Aucun match du jour dans la base');
            console.log('💡 Lancez: npm run sync:today-matches');
        } else {
            console.log('\n📊 Matchs du jour par tour:');
            counts.rows.forEach(row => {
                console.log(`  ${row.tour}: ${row.count} matchs`);
                if (row.earliest_match) {
                    console.log(`    Premier match: ${row.earliest_match.toLocaleString('fr-FR')}`);
                    console.log(`    Dernier match: ${row.latest_match.toLocaleString('fr-FR')}`);
                }
            });
        }
        
        // Afficher quelques exemples
        const exampleQuery = `
            SELECT 
                tm.tour,
                t.name as tournament_name,
                p1.full_name as player1_name,
                p2.full_name as player2_name,
                r.name as round_name,
                tm.match_datetime,
                tm.last_sync
            FROM today_matches tm
            JOIN tournaments t ON tm.tournament_id = t.id
            JOIN players p1 ON tm.player1_id = p1.id
            JOIN players p2 ON tm.player2_id = p2.id
            JOIN rounds r ON tm.round_id = r.id
            ORDER BY tm.match_datetime
            LIMIT 5
        `;
        
        const examples = await pgDB.query(exampleQuery);
        
        if (examples.rows.length > 0) {
            console.log('\n📋 Exemples de matchs du jour:');
            examples.rows.forEach((match, index) => {
                console.log(`  ${index + 1}. ${match.tour} - ${match.tournament_name}`);
                console.log(`     ${match.player1_name} vs ${match.player2_name}`);
                console.log(`     ${match.round_name} - ${match.match_datetime?.toLocaleString('fr-FR')}`);
                console.log(`     Dernière sync: ${match.last_sync?.toLocaleString('fr-FR')}`);
                console.log('');
            });
        }
        
        // Vérifier la structure de la table
        const columnsQuery = `
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'today_matches'
            ORDER BY ordinal_position
        `;
        
        const columns = await pgDB.query(columnsQuery);
        console.log('\n🗂️  Structure de la table today_matches:');
        columns.rows.forEach(col => {
            const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
            console.log(`  - ${col.column_name}: ${col.data_type} (${nullable})`);
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        if (pgDB) {
            await pgDB.end();
            console.log('📡 Connexion fermée');
        }
    }
}

if (require.main === module) {
    testTodayMatches().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = { testTodayMatches };