// =============================================
// SCRIPT DE NETTOYAGE COMPLET DE LA BASE
// =============================================

const { Client } = require('pg');
require('dotenv').config();

// Configuration PostgreSQL
const pgConfig = {
    host: process.env.PG_HOST ,
    port: process.env.PG_PORT ,
    database: process.env.PG_DATABASE ,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD
};

let pgDB;

// =============================================
// FONCTION PRINCIPALE
// =============================================

async function cleanDatabase() {
    console.log('🧹 NETTOYAGE COMPLET DE LA BASE TENNIS');
    console.log('=====================================');
    console.log('');
    
    try {
        // 1. Connexion à PostgreSQL
        await connectDatabase();
        
        // 2. Afficher l'état actuel
        await displayCurrentState();
        
        // 3. Demander confirmation
        await confirmCleanup();
        
        // 4. Nettoyage des tables
        await truncateAllTables();
        
        // 5. Vérifier que tout est vide
        await verifyCleanup();
        
        console.log('\n✅ NETTOYAGE TERMINÉ AVEC SUCCÈS !');
        console.log('La base est maintenant vide et prête pour une nouvelle migration.');
        
    } catch (error) {
        console.error('\n❌ ERREUR DURANT LE NETTOYAGE:', error.message);
        process.exit(1);
    } finally {
        await closeDatabase();
    }
}

// =============================================
// CONNEXION
// =============================================

async function connectDatabase() {
    console.log('📡 Connexion à PostgreSQL...');
    
    try {
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('  ✅ PostgreSQL connecté');
        
        // Vérifier que nous sommes sur la bonne base
        const dbResult = await pgDB.query('SELECT current_database()');
        console.log(`  🗃️  Base de données: ${dbResult.rows[0].current_database}`);
        
    } catch (error) {
        throw new Error(`Connexion PostgreSQL impossible: ${error.message}`);
    }
}

async function closeDatabase() {
    console.log('\n🔌 Fermeture de la connexion...');
    
    try {
        if (pgDB) {
            await pgDB.end();
            console.log('  ✅ PostgreSQL fermé');
        }
    } catch (error) {
        console.log('  ⚠️  Erreur fermeture PostgreSQL:', error.message);
    }
}

// =============================================
// ÉTAT ACTUEL DE LA BASE
// =============================================

async function displayCurrentState() {
    console.log('📊 État actuel de la base de données...');
    
    try {
        // Lister toutes les tables avec leur nombre d'enregistrements
        const tablesQuery = `
            SELECT 
                t.table_name,
                CASE 
                    WHEN t.table_name = 'countries' THEN (SELECT COUNT(*) FROM countries)
                    WHEN t.table_name = 'court_surfaces' THEN (SELECT COUNT(*) FROM court_surfaces)
                    WHEN t.table_name = 'type_tournoi' THEN (SELECT COUNT(*) FROM type_tournoi)
                    WHEN t.table_name = 'tier_tournoi' THEN (SELECT COUNT(*) FROM tier_tournoi)
                    WHEN t.table_name = 'rounds' THEN (SELECT COUNT(*) FROM rounds)
                    WHEN t.table_name = 'players' THEN (SELECT COUNT(*) FROM players)
                    WHEN t.table_name = 'tournaments' THEN (SELECT COUNT(*) FROM tournaments)
                    WHEN t.table_name = 'matches' THEN (SELECT COUNT(*) FROM matches)
                    WHEN t.table_name = 'player_rankings' THEN (SELECT COUNT(*) FROM player_rankings)
                    WHEN t.table_name = 'player_tournament_status' THEN (SELECT COUNT(*) FROM player_tournament_status)
                    ELSE 0
                END as row_count
            FROM information_schema.tables t
            WHERE t.table_schema = 'public' 
            AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name
        `;
        
        const tables = await pgDB.query(tablesQuery);
        
        console.log('');
        console.log('📋 Tables et nombre d\'enregistrements:');
        
        let totalRecords = 0;
        let nonEmptyTables = 0;
        
        for (const table of tables.rows) {
            const count = parseInt(table.row_count);
            totalRecords += count;
            
            if (count > 0) {
                nonEmptyTables++;
                console.log(`  📦 ${table.table_name}: ${count.toLocaleString()} enregistrements`);
            } else {
                console.log(`  📦 ${table.table_name}: vide`);
            }
        }
        
        console.log('');
        console.log(`📈 Résumé: ${totalRecords.toLocaleString()} enregistrements total dans ${nonEmptyTables} tables`);
        
        if (totalRecords === 0) {
            console.log('✅ La base est déjà vide !');
            process.exit(0);
        }
        
    } catch (error) {
        console.error('  ❌ Erreur lors de l\'analyse:', error.message);
    }
}

// =============================================
// CONFIRMATION
// =============================================

async function confirmCleanup() {
    const readline = require('readline');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        console.log('');
        console.log('⚠️  ATTENTION: Cette opération va SUPPRIMER TOUTES LES DONNÉES !');
        console.log('');
        
        rl.question('Êtes-vous sûr de vouloir continuer ? (tapez "OUI" pour confirmer): ', (answer) => {
            rl.close();
            
            if (answer.toUpperCase() === 'OUI') {
                console.log('');
                console.log('✅ Confirmation reçue. Début du nettoyage...');
                resolve();
            } else {
                console.log('');
                console.log('❌ Opération annulée.');
                process.exit(0);
            }
        });
    });
}

// =============================================
// NETTOYAGE DES TABLES
// =============================================

async function truncateAllTables() {
    console.log('\n🗑️  Nettoyage des tables...');
    
    // Ordre important : supprimer d'abord les tables qui référencent d'autres tables
    const tablesOrder = [
        'player_tournament_status',  // Références players + tournaments
        'player_rankings',           // Références players
        'matches',                   // Références players + tournaments + rounds
        'tournaments',               // Références countries + court_surfaces + type_tournoi + tier_tournoi
        'players',                   // Références countries
        'tier_tournoi',              // Peut être référencé par tournaments
        'rounds',                    // Peut être référencé par matches
        'type_tournoi',              // Peut être référencé par tournaments
        'court_surfaces',            // Peut être référencé par tournaments
        'countries'                  // Peut être référencé par players + tournaments
    ];
    
    let cleanedTables = 0;
    let totalRecordsDeleted = 0;
    
    for (const tableName of tablesOrder) {
        try {
            // Compter les enregistrements avant suppression
            const countBefore = await pgDB.query(`SELECT COUNT(*) as count FROM ${tableName}`);
            const recordsBefore = parseInt(countBefore.rows[0].count);
            
            if (recordsBefore > 0) {
                // Supprimer les données et remettre les ID à zéro
                await pgDB.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
                
                console.log(`  🗑️  ${tableName}: ${recordsBefore.toLocaleString()} enregistrements supprimés`);
                totalRecordsDeleted += recordsBefore;
                cleanedTables++;
            } else {
                console.log(`  ⭕ ${tableName}: déjà vide`);
            }
            
        } catch (error) {
            // Continuer même si une table n'existe pas
            console.log(`  ⚠️  ${tableName}: ${error.message}`);
        }
    }
    
    console.log('');
    console.log(`📊 Nettoyage terminé: ${totalRecordsDeleted.toLocaleString()} enregistrements supprimés dans ${cleanedTables} tables`);
}

// =============================================
// VÉRIFICATION DU NETTOYAGE
// =============================================

async function verifyCleanup() {
    console.log('\n🔍 Vérification du nettoyage...');
    
    try {
        // Vérifier que toutes les tables sont vides
        const verificationQueries = [
            'SELECT COUNT(*) as count FROM countries',
            'SELECT COUNT(*) as count FROM court_surfaces',
            'SELECT COUNT(*) as count FROM type_tournoi',
            'SELECT COUNT(*) as count FROM tier_tournoi',
            'SELECT COUNT(*) as count FROM rounds',
            'SELECT COUNT(*) as count FROM players',
            'SELECT COUNT(*) as count FROM tournaments',
            'SELECT COUNT(*) as count FROM matches',
            'SELECT COUNT(*) as count FROM player_rankings',
            'SELECT COUNT(*) as count FROM player_tournament_status'
        ];
        
        let totalRemaining = 0;
        let problemTables = [];
        
        for (const query of verificationQueries) {
            try {
                const result = await pgDB.query(query);
                const count = parseInt(result.rows[0].count);
                totalRemaining += count;
                
                if (count > 0) {
                    const tableName = query.match(/FROM (\w+)/)[1];
                    problemTables.push(`${tableName} (${count})`);
                }
            } catch (error) {
                // Table n'existe pas, c'est normal
            }
        }
        
        if (totalRemaining === 0) {
            console.log('  ✅ Toutes les tables sont vides');
            
            // Vérifier que les séquences sont remises à zéro
            const sequenceCheck = await pgDB.query(`
                SELECT schemaname, sequencename, last_value 
                FROM pg_sequences 
                WHERE schemaname = 'public'
            `);
            
            if (sequenceCheck.rows.length > 0) {
                console.log('  🔢 Séquences d\'ID remises à zéro:');
                sequenceCheck.rows.forEach(seq => {
                    console.log(`    - ${seq.sequencename}: ${seq.last_value}`);
                });
            }
            
        } else {
            console.log(`  ⚠️  ${totalRemaining} enregistrements restants dans: ${problemTables.join(', ')}`);
        }
        
    } catch (error) {
        console.error('  ❌ Erreur lors de la vérification:', error.message);
    }
}

// =============================================
// SCRIPT RAPIDE SANS CONFIRMATION
// =============================================

async function forceCleanDatabase() {
    console.log('🧹 NETTOYAGE FORCÉ (sans confirmation)');
    console.log('======================================');
    
    try {
        await connectDatabase();
        await truncateAllTables();
        await verifyCleanup();
        console.log('\n✅ NETTOYAGE FORCÉ TERMINÉ !');
    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        process.exit(1);
    } finally {
        await closeDatabase();
    }
}

// =============================================
// EXÉCUTION
// =============================================

// Vérifier les arguments de ligne de commande
const args = process.argv.slice(2);

if (require.main === module) {
    if (args.includes('--force')) {
        // Nettoyage forcé sans confirmation
        forceCleanDatabase().catch(error => {
            console.error('❌ ERREUR FATALE:', error);
            process.exit(1);
        });
    } else {
        // Nettoyage normal avec confirmation
        cleanDatabase().catch(error => {
            console.error('❌ ERREUR FATALE:', error);
            process.exit(1);
        });
    }
}

module.exports = { cleanDatabase, forceCleanDatabase };