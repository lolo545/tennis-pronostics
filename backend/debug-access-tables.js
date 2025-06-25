// Script de debug pour identifier les problèmes avec les tables Access
const odbc = require('odbc');
require('dotenv').config();

const accessConfig = {
    connectionString: process.env.ACCESS_CONNECTION_STRING
};

async function debugAccessTables() {
    console.log('🔍 DEBUG DES TABLES ACCESS');
    console.log('==========================\n');
    
    let accessDB;
    
    try {
        console.log('📡 Connexion à Access...');
        accessDB = await odbc.connect(accessConfig.connectionString);
        console.log('✅ Connexion établie\n');
        
        // Test 1: Lister les tables disponibles
        console.log('📋 Tables disponibles :');
        try {
            const tables = await accessDB.tables();
            tables.forEach((table, index) => {
                if (table.TABLE_NAME.toLowerCase().includes('tournament') || 
                    table.TABLE_NAME.toLowerCase().includes('match') ||
                    table.TABLE_NAME.toLowerCase().includes('rating')) {
                    console.log(`  ${index + 1}. ${table.TABLE_NAME} (${table.TABLE_TYPE})`);
                }
            });
        } catch (error) {
            console.log('  ❌ Impossible de lister les tables:', error.message);
        }
        
        console.log('\n');
        
        // Test 2: Structure des tables tournaments
        console.log('🏆 STRUCTURE TABLE TOURNAMENTS_ATP :');
        try {
            const columns = await accessDB.columns('tournaments_atp');
            console.log('  Colonnes disponibles :');
            columns.forEach(col => {
                console.log(`    - ${col.COLUMN_NAME} (${col.TYPE_NAME})`);
            });
        } catch (error) {
            console.log('  ❌ Erreur:', error.message);
        }
        
        console.log('\n');
        
        // Test 3: Structure des tables matches
        console.log('🎾 STRUCTURE TABLE MATCHES_ATP :');
        try {
            const columns = await accessDB.columns('matches_atp');
            console.log('  Colonnes disponibles :');
            columns.forEach(col => {
                console.log(`    - ${col.COLUMN_NAME} (${col.TYPE_NAME})`);
            });
        } catch (error) {
            console.log('  ❌ Erreur:', error.message);
        }
        
        console.log('\n');
        
        // Test 4: Requête simple sur tournaments
        console.log('🧪 TEST REQUÊTE TOURNAMENTS_ATP :');
        try {
            const simpleQuery = `
                SELECT TOP 5 ID_T, NAME_T, DATE_T 
                FROM tournaments_atp 
                ORDER BY DATE_T DESC
            `;
            const result = await accessDB.query(simpleQuery);
            console.log(`  ✅ ${result.length} tournois trouvés`);
            result.forEach((row, index) => {
                console.log(`    ${index + 1}. ${row.NAME_T} (${row.DATE_T})`);
            });
        } catch (error) {
            console.log('  ❌ Erreur requête:', error.message);
        }
        
        console.log('\n');
        
        // Test 5: Requête simple sur matches
        console.log('🧪 TEST REQUÊTE MATCHES_ATP :');
        try {
            const simpleQuery = `
                SELECT TOP 5 ID_M, DATE_M, ID_1_M, ID_2_M 
                FROM matches_atp 
                ORDER BY DATE_M DESC
            `;
            const result = await accessDB.query(simpleQuery);
            console.log(`  ✅ ${result.length} matchs trouvés`);
            result.forEach((row, index) => {
                console.log(`    ${index + 1}. Match ${row.ID_M} (${row.DATE_M})`);
            });
        } catch (error) {
            console.log('  ❌ Erreur requête:', error.message);
        }
        
        console.log('\n');
        
        // Test 6: Requête avec WHERE sur date
        console.log('🧪 TEST REQUÊTE AVEC WHERE DATE :');
        try {
            const dateQuery = `
                SELECT COUNT(*) as total 
                FROM tournaments_atp 
                WHERE DATE_T >= #2024-01-01#
            `;
            const result = await accessDB.query(dateQuery);
            console.log(`  ✅ ${result[0].total} tournois depuis 2024`);
        } catch (error) {
            console.log('  ❌ Erreur requête avec date:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Erreur générale:', error.message);
    } finally {
        if (accessDB) {
            try {
                await accessDB.close();
                console.log('\n📡 Connexion Access fermée');
            } catch (error) {
                console.error('❌ Erreur fermeture:', error.message);
            }
        }
    }
}

// Lancer le debug
debugAccessTables();