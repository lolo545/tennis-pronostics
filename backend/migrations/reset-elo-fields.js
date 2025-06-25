// =============================================
// REMISE À NULL DE TOUTES LES COLONNES ELO
// =============================================

const { Client } = require('pg');
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

async function resetEloFields() {
    console.log('\n🎾 REMISE À NULL DES COLONNES ELO');
    console.log('=================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    try {
        await connectDatabase();
        
        // Vérifier d'abord les colonnes ELO existantes
        console.log('🔍 Vérification des colonnes ELO existantes...');
        
        const checkColumnsQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'matches' 
            AND column_name LIKE '%elo%'
            ORDER BY column_name;
        `;
        
        const existingColumns = await pgDB.query(checkColumnsQuery);
        
        if (existingColumns.rows.length === 0) {
            console.log('❌ Aucune colonne ELO trouvée dans la table matches');
            return;
        }
        
        console.log('📊 Colonnes ELO trouvées:');
        const eloColumns = existingColumns.rows.map(row => row.column_name);
        eloColumns.forEach(col => console.log(`   - ${col}`));
        
        // Statistiques avant la remise à zéro
        await displayStatsBeforeReset(eloColumns);
        
        // Debug: afficher les arguments reçus
        console.log(`🔍 Arguments reçus: ${process.argv.join(' ')}`);
        
        // Demander confirmation si pas en mode force
        const forceMode = process.argv.includes('--force') || process.argv.includes('force');
        console.log(`🔍 Mode force détecté: ${forceMode}`);
        
        if (!forceMode) {
            console.log('\n⚠️  ATTENTION: Cette opération va supprimer TOUTES les données ELO!');
            console.log('   Pour confirmer, utilisez une de ces commandes:');
            console.log('   - npm run reset:elo-fields -- --force');
            console.log('   - node migrations/reset-elo-fields.js --force');
            return;
        }
        
        console.log('\n🔄 Remise à NULL en cours...');
        
        // Construire la requête UPDATE
        const setClause = eloColumns.map(col => `${col} = NULL`).join(', ');
        const resetQuery = `UPDATE matches SET ${setClause}`;
        
        // Exécuter la remise à zéro
        const result = await pgDB.query(resetQuery);
        
        console.log(`✅ ${result.rowCount} lignes mises à jour`);
        
        // Statistiques après la remise à zéro
        await displayStatsAfterReset(eloColumns);
        
        console.log('\n✅ REMISE À NULL TERMINÉE AVEC SUCCÈS');
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabase();
    }
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function displayStatsBeforeReset(eloColumns) {
    try {
        console.log('\n📈 Statistiques avant remise à zéro:');
        
        // Statistiques générales
        const generalStatsQuery = `
            SELECT 
                COUNT(*) as total_matches,
                COUNT(winner_elo) as winner_elo_count,
                COUNT(loser_elo) as loser_elo_count
            FROM matches
        `;
        
        const generalStats = await pgDB.query(generalStatsQuery);
        const general = generalStats.rows[0];
        
        console.log(`   - Total matchs: ${general.total_matches}`);
        console.log(`   - Matchs avec winner_elo: ${general.winner_elo_count}`);
        console.log(`   - Matchs avec loser_elo: ${general.loser_elo_count}`);
        
        // Statistiques détaillées par colonne
        console.log('\n📊 Détail par colonne ELO:');
        for (const column of eloColumns) {
            const columnStatsQuery = `
                SELECT 
                    COUNT(${column}) as non_null_count,
                    AVG(${column}) as avg_value,
                    MIN(${column}) as min_value,
                    MAX(${column}) as max_value
                FROM matches
                WHERE ${column} IS NOT NULL
            `;
            
            const columnStats = await pgDB.query(columnStatsQuery);
            const stats = columnStats.rows[0];
            
            if (stats.non_null_count > 0) {
                console.log(`   - ${column}: ${stats.non_null_count} valeurs (avg: ${Math.round(stats.avg_value)}, min: ${stats.min_value}, max: ${stats.max_value})`);
            } else {
                console.log(`   - ${column}: 0 valeurs`);
            }
        }
        
    } catch (error) {
        console.error('Erreur affichage statistiques avant:', error.message);
    }
}

async function displayStatsAfterReset(eloColumns) {
    try {
        console.log('\n📈 Vérification après remise à zéro:');
        
        // Vérifier que toutes les colonnes sont bien à NULL
        for (const column of eloColumns) {
            const checkQuery = `
                SELECT COUNT(${column}) as remaining_count
                FROM matches
                WHERE ${column} IS NOT NULL
            `;
            
            const result = await pgDB.query(checkQuery);
            const remainingCount = result.rows[0].remaining_count;
            
            if (remainingCount > 0) {
                console.log(`   ⚠️  ${column}: ${remainingCount} valeurs restantes (erreur!)`);
            } else {
                console.log(`   ✅ ${column}: toutes les valeurs sont NULL`);
            }
        }
        
    } catch (error) {
        console.error('Erreur vérification après remise à zéro:', error.message);
    }
}

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
    resetEloFields().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    resetEloFields
};