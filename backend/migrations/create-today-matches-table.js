// =============================================
// CRÉATION TABLE TODAY_MATCHES VIA NODE.JS
// =============================================

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'tennis_pronostics',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD
};

async function createTodayMatchesTable() {
    console.log('🎾 CRÉATION TABLE TODAY_MATCHES');
    console.log('===============================');
    
    let pgDB = null;
    
    try {
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('✅ Connexion PostgreSQL établie');
        
        // Lire le fichier SQL
        const sqlPath = path.join(__dirname, 'create-today-matches-table.sql');
        const createTableSQL = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('🔧 Exécution du script SQL...');
        await pgDB.query(createTableSQL);
        
        console.log('✅ Table today_matches créée avec succès');
        
        // Vérifier que la table a été créée
        const tableCheck = await pgDB.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'today_matches'
        `);
        
        if (tableCheck.rows.length > 0) {
            console.log('✅ Vérification : table today_matches existe');
            
            // Compter les colonnes
            const columnsCount = await pgDB.query(`
                SELECT COUNT(*) as count
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'today_matches'
            `);
            
            console.log(`📊 ${columnsCount.rows[0].count} colonnes créées`);
        } else {
            throw new Error('La table n\'a pas été créée correctement');
        }
        
    } catch (error) {
        console.error('❌ Erreur création table:', error.message);
        throw error;
    } finally {
        if (pgDB) {
            await pgDB.end();
            console.log('📡 Connexion fermée');
        }
    }
}

if (require.main === module) {
    createTodayMatchesTable().then(() => {
        console.log('\n🎉 Table today_matches prête à l\'utilisation !');
        console.log('💡 Vous pouvez maintenant lancer: npm run sync:today-matches');
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = { createTodayMatchesTable };