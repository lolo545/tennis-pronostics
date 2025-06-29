// =============================================
// SYNCHRONISATION MATCHS DU JOUR
// =============================================

const { Client } = require('pg');
require('dotenv').config();

// Essayer de charger ODBC, avec fallback si indisponible
let odbc = null;
try {
    odbc = require('odbc');
} catch (error) {
    console.warn('⚠️  Module ODBC non disponible:', error.message);
    console.warn('⚠️  Utilisation du mode PostgreSQL uniquement');
}

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

// Cache pour les mappings
const mappings = {
    tournaments: new Map(), // clé: 'ATP_ID' ou 'WTA_ID', valeur: PostgreSQL ID
    players: new Map(),     // clé: 'ATP_ID' ou 'WTA_ID', valeur: PostgreSQL ID
    rounds: new Map()       // clé: Access ID, valeur: PostgreSQL ID
};

// Statistiques de synchronisation
const syncStats = {
    todayMatchesATP: 0,
    todayMatchesWTA: 0,
    deleted: 0,
    errors: 0,
    filtered: {
        unknownPlayer: 0,
        slashInName: 0,
        emptyDate: 0,
        mappingMissing: 0
    },
    startTime: null,
    endTime: null
};

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

async function syncTodayMatches() {
    console.log('\n🎾 SYNCHRONISATION MATCHS DU JOUR');
    console.log('==================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    syncStats.startTime = Date.now();
    
    try {
        await connectDatabases();
        await ensureTableExists();
        await loadMappings();
        
        // Synchroniser les matchs ATP et WTA
        await syncTodayMatchesTour('ATP');
        await syncTodayMatchesTour('WTA');
        
        // Nettoyer les matchs qui n'existent plus dans Access
        await cleanupDeletedMatches();
        
        syncStats.endTime = Date.now();
        const duration = Math.round((syncStats.endTime - syncStats.startTime) / 1000);
        
        console.log('\n✅ SYNCHRONISATION TERMINÉE');
        console.log(`⏱️  Durée: ${duration}s`);
        console.log(`📊 Résumé:`);
        console.log(`   - Matchs ATP ajoutés/mis à jour: ${syncStats.todayMatchesATP}`);
        console.log(`   - Matchs WTA ajoutés/mis à jour: ${syncStats.todayMatchesWTA}`);
        console.log(`   - Matchs supprimés: ${syncStats.deleted}`);
        console.log(`   - Erreurs totales: ${syncStats.errors}`);
        
        // Détail des filtres appliqués
        const totalFiltered = Object.values(syncStats.filtered).reduce((a, b) => a + b, 0);
        if (totalFiltered > 0) {
            console.log(`\n🔍 Matchs filtrés (${totalFiltered} total):`);
            if (syncStats.filtered.unknownPlayer > 0) {
                console.log(`   - "Unknown Player": ${syncStats.filtered.unknownPlayer}`);
            }
            if (syncStats.filtered.slashInName > 0) {
                console.log(`   - Caractère "/" dans nom: ${syncStats.filtered.slashInName}`);
            }
            if (syncStats.filtered.emptyDate > 0) {
                console.log(`   - Date vide: ${syncStats.filtered.emptyDate}`);
            }
            if (syncStats.filtered.mappingMissing > 0) {
                console.log(`   - Mapping manquant: ${syncStats.filtered.mappingMissing}`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ ERREUR SYNCHRONISATION:', error.message);
        throw error;
    } finally {
        await closeDatabases();
    }
}

// =============================================
// CONNEXIONS ET INITIALISATION
// =============================================

async function connectDatabases() {
    console.log('📡 Connexion aux bases de données...');
    
    try {
        if (odbc && accessConfig.connectionString) {
            accessDB = await odbc.connect(accessConfig.connectionString);
            console.log('  ✅ Connexion Access établie');
        } else {
            console.log('  ⚠️  Connexion Access désactivée (ODBC non disponible)');
        }
        
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('  ✅ Connexion PostgreSQL établie');
        
    } catch (error) {
        throw new Error(`Échec connexion: ${error.message}`);
    }
}

async function closeDatabases() {
    if (accessDB) {
        try {
            await accessDB.close();
            console.log('📡 Connexion Access fermée');
        } catch (error) {
            console.error('Erreur fermeture Access:', error.message);
        }
    }
    
    if (pgDB) {
        try {
            await pgDB.end();
            console.log('📡 Connexion PostgreSQL fermée');
        } catch (error) {
            console.error('Erreur fermeture PostgreSQL:', error.message);
        }
    }
}

async function ensureTableExists() {
    console.log('🗂️  Vérification de la table today_matches...');
    
    try {
        // Vérifier si la table existe
        const tableCheck = await pgDB.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'today_matches'
        `);
        
        if (tableCheck.rows.length === 0) {
            console.log('  🔧 Création de la table today_matches...');
            
            // Lire et exécuter le script SQL de création
            const fs = require('fs');
            const path = require('path');
            const sqlPath = path.join(__dirname, 'create-today-matches-table.sql');
            const createTableSQL = fs.readFileSync(sqlPath, 'utf8');
            
            await pgDB.query(createTableSQL);
            console.log('  ✅ Table today_matches créée');
        } else {
            console.log('  ✅ Table today_matches existante');
        }
        
    } catch (error) {
        throw new Error(`Erreur création table: ${error.message}`);
    }
}

async function loadMappings() {
    console.log('🗂️  Chargement des mappings...');
    
    // Charger les tournois ATP
    const tournamentsATP = await pgDB.query(
        'SELECT id, atp_id FROM tournaments WHERE tour = \'ATP\' AND atp_id IS NOT NULL'
    );
    tournamentsATP.rows.forEach(tournament => {
        mappings.tournaments.set(`ATP_${tournament.atp_id}`, tournament.id);
    });
    
    // Charger les tournois WTA
    const tournamentsWTA = await pgDB.query(
        'SELECT id, wta_id FROM tournaments WHERE tour = \'WTA\' AND wta_id IS NOT NULL'
    );
    tournamentsWTA.rows.forEach(tournament => {
        mappings.tournaments.set(`WTA_${tournament.wta_id}`, tournament.id);
    });
    
    // Charger les joueurs ATP
    const playersATP = await pgDB.query(
        'SELECT id, atp_id FROM players WHERE tour = \'ATP\' AND atp_id IS NOT NULL'
    );
    playersATP.rows.forEach(player => {
        mappings.players.set(`ATP_${player.atp_id}`, player.id);
    });
    
    // Charger les joueurs WTA
    const playersWTA = await pgDB.query(
        'SELECT id, wta_id FROM players WHERE tour = \'WTA\' AND wta_id IS NOT NULL'
    );
    playersWTA.rows.forEach(player => {
        mappings.players.set(`WTA_${player.wta_id}`, player.id);
    });
    
    // Charger les rounds
    const rounds = await pgDB.query('SELECT id, atp_id FROM rounds WHERE atp_id IS NOT NULL');
    rounds.rows.forEach(round => {
        mappings.rounds.set(round.atp_id, round.id);
    });
    
    console.log(`  ✅ Mappings chargés:`);
    console.log(`     - Tournois ATP: ${tournamentsATP.rows.length}`);
    console.log(`     - Tournois WTA: ${tournamentsWTA.rows.length}`);
    console.log(`     - Joueurs ATP: ${playersATP.rows.length}`);
    console.log(`     - Joueurs WTA: ${playersWTA.rows.length}`);
    console.log(`     - Rounds: ${rounds.rows.length}`);
}

// =============================================
// SYNCHRONISATION PAR TOUR
// =============================================

async function syncTodayMatchesTour(tour) {
    console.log(`\n🏆 Synchronisation matchs ${tour} du jour...`);
    
    if (!accessDB) {
        console.log(`  ⚠️  Pas de connexion Access, synchronisation ignorée`);
        return;
    }
    
    const tableName = `today_${tour.toLowerCase()}`;
    
    // Requête pour récupérer les matchs du jour sans résultat (filtrage de base)
    const query = `
        SELECT TOUR, DATE_GAME, ID1, ID2, ROUND
        FROM ${tableName}
        WHERE (RESULT IS NULL OR RESULT = '')
          AND DATE_GAME IS NOT NULL
        ORDER BY DATE_GAME
    `;
    
    try {
        const todayMatches = await accessDB.query(query);
        console.log(`  📊 ${todayMatches.length} matchs ${tour} trouvés dans Access`);
        
        let processed = 0;
        let errors = 0;
        
        for (const match of todayMatches) {
            try {
                // Récupérer les noms des joueurs pour validation
                const playerNames = await getPlayerNames(match.ID1, match.ID2, tour);
                
                // Vérifier les filtres avant traitement
                if (!validateMatch(match, playerNames)) {
                    continue; // Passer au match suivant
                }
                
                // Ajouter les noms au match pour processing
                match.PLAYER1_NAME = playerNames.player1;
                match.PLAYER2_NAME = playerNames.player2;
                
                await processTodayMatch(match, tour);
                processed++;
            } catch (error) {
                errors++;
                
                // Comptabiliser les types d'erreurs pour les statistiques
                const errorMsg = error.message.toLowerCase();
                if (errorMsg.includes('unknown player')) {
                    syncStats.filtered.unknownPlayer++;
                } else if (errorMsg.includes('invalide')) {
                    syncStats.filtered.slashInName++;
                } else if (errorMsg.includes('date_game vide')) {
                    syncStats.filtered.emptyDate++;
                } else if (errorMsg.includes('mapping manquant')) {
                    syncStats.filtered.mappingMissing++;
                }
                
                // Limiter les logs d'erreur pour éviter le spam
                if (errors <= 5) {
                    console.error(`    ❌ Erreur match ${match.ID1} vs ${match.ID2}:`, error.message);
                } else if (errors === 6) {
                    console.error(`    ❌ ... et d'autres erreurs (total: ${errors})`);
                }
            }
        }
        
        if (tour === 'ATP') syncStats.todayMatchesATP = processed;
        else syncStats.todayMatchesWTA = processed;
        
        console.log(`  ✅ ${processed} matchs ${tour} synchronisés (${errors} erreurs)`);
        
    } catch (error) {
        console.error(`  ❌ Erreur sync matchs ${tour}:`, error.message);
        syncStats.errors++;
    }
}

async function processTodayMatch(match, tour) {
    // Vérifications préliminaires des données
    if (!match.DATE_GAME) {
        throw new Error('DATE_GAME vide');
    }
    
    // Vérifier les noms de joueurs (sécurité supplémentaire)
    if (match.PLAYER1_NAME && (
        match.PLAYER1_NAME.includes('Unknown Player') || 
        match.PLAYER1_NAME.includes('/')
    )) {
        throw new Error(`Joueur 1 invalide: ${match.PLAYER1_NAME}`);
    }
    
    if (match.PLAYER2_NAME && (
        match.PLAYER2_NAME.includes('Unknown Player') || 
        match.PLAYER2_NAME.includes('/')
    )) {
        throw new Error(`Joueur 2 invalide: ${match.PLAYER2_NAME}`);
    }
    
    // Mapper les IDs Access vers PostgreSQL
    const tournamentId = mappings.tournaments.get(`${tour}_${match.TOUR}`);
    const player1Id = mappings.players.get(`${tour}_${match.ID1}`);
    const player2Id = mappings.players.get(`${tour}_${match.ID2}`);
    const roundId = mappings.rounds.get(match.ROUND);
    
    if (!tournamentId || !player1Id || !player2Id || !roundId) {
        throw new Error(`Mapping manquant: tournoi=${!!tournamentId}, joueur1=${!!player1Id}, joueur2=${!!player2Id}, round=${!!roundId}`);
    }
    
    // Vérifier si le match existe déjà
    const existingMatch = await pgDB.query(`
        SELECT id FROM today_matches 
        WHERE tour = $1 
        AND access_tour_id = $2 
        AND access_player1_id = $3 
        AND access_player2_id = $4 
        AND access_round_id = $5
    `, [tour, match.TOUR, match.ID1, match.ID2, match.ROUND]);
    
    if (existingMatch.rows.length > 0) {
        // Mettre à jour le match existant
        await pgDB.query(`
            UPDATE today_matches SET 
                tournament_id = $2,
                player1_id = $3,
                player2_id = $4,
                round_id = $5,
                match_datetime = $6,
                last_sync = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [
            existingMatch.rows[0].id,
            tournamentId,
            player1Id,
            player2Id,
            roundId,
            match.DATE_GAME
        ]);
    } else {
        // Insérer un nouveau match
        await pgDB.query(`
            INSERT INTO today_matches (
                tour, tournament_id, player1_id, player2_id, round_id,
                match_datetime, access_tour_id, access_player1_id, 
                access_player2_id, access_round_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            tour, tournamentId, player1Id, player2Id, roundId,
            match.DATE_GAME, match.TOUR, match.ID1, match.ID2, match.ROUND
        ]);
    }
}

// =============================================
// FONCTIONS UTILITAIRES DE VALIDATION
// =============================================

async function getPlayerNames(player1Id, player2Id, tour) {
    try {
        const playerTable = `players_${tour.toLowerCase()}`;
        
        // Récupérer les noms des deux joueurs
        const query = `
            SELECT ID_P, NAME_P 
            FROM ${playerTable} 
            WHERE ID_P IN (${player1Id}, ${player2Id})
        `;
        
        const players = await accessDB.query(query);
        
        let player1Name = null;
        let player2Name = null;
        
        players.forEach(player => {
            if (player.ID_P === player1Id) {
                player1Name = player.NAME_P;
            } else if (player.ID_P === player2Id) {
                player2Name = player.NAME_P;
            }
        });
        
        return {
            player1: player1Name,
            player2: player2Name
        };
        
    } catch (error) {
        // En cas d'erreur, retourner null pour les noms
        return {
            player1: null,
            player2: null
        };
    }
}

function validateMatch(match, playerNames) {
    // Vérifier que la date n'est pas vide (déjà filtré en SQL mais sécurité)
    if (!match.DATE_GAME) {
        syncStats.filtered.emptyDate++;
        return false;
    }
    
    // Vérifier les noms des joueurs
    if (!playerNames.player1 || !playerNames.player2) {
        syncStats.filtered.mappingMissing++;
        return false;
    }
    
    // Vérifier "Unknown Player"
    if (playerNames.player1.includes('Unknown Player') || 
        playerNames.player2.includes('Unknown Player')) {
        syncStats.filtered.unknownPlayer++;
        return false;
    }
    
    // Vérifier le caractère "/"
    if (playerNames.player1.includes('/') || 
        playerNames.player2.includes('/')) {
        syncStats.filtered.slashInName++;
        return false;
    }
    
    return true; // Match valide
}

// =============================================
// NETTOYAGE DES MATCHS SUPPRIMÉS
// =============================================

async function cleanupDeletedMatches() {
    console.log('\n🧹 Nettoyage des matchs supprimés...');
    
    if (!accessDB) {
        console.log('  ⚠️  Pas de connexion Access, nettoyage ignoré');
        return;
    }
    
    try {
        // Récupérer tous les matchs de la table PostgreSQL
        const pgMatches = await pgDB.query(`
            SELECT id, tour, access_tour_id, access_player1_id, 
                   access_player2_id, access_round_id
            FROM today_matches
        `);
        
        let deleted = 0;
        
        for (const pgMatch of pgMatches.rows) {
            const tour = pgMatch.tour;
            const tableName = `today_${tour.toLowerCase()}`;
            
            // Vérifier si le match existe encore dans Access
            const accessQuery = `
                SELECT COUNT(*) as count
                FROM ${tableName}
                WHERE TOUR = ${pgMatch.access_tour_id}
                AND ID1 = ${pgMatch.access_player1_id}
                AND ID2 = ${pgMatch.access_player2_id}
                AND ROUND = ${pgMatch.access_round_id}
                AND (RESULT IS NULL OR RESULT = '')
            `;
            
            try {
                const accessResult = await accessDB.query(accessQuery);
                const existsInAccess = accessResult[0].count > 0;
                
                if (!existsInAccess) {
                    // Supprimer le match de PostgreSQL
                    await pgDB.query('DELETE FROM today_matches WHERE id = $1', [pgMatch.id]);
                    deleted++;
                    
                    if (deleted <= 5) { // Limiter les logs
                        console.log(`  🗑️  Match supprimé: ${tour} ${pgMatch.access_tour_id} ${pgMatch.access_player1_id} vs ${pgMatch.access_player2_id}`);
                    }
                }
            } catch (error) {
                console.error(`  ❌ Erreur vérification match ${pgMatch.id}:`, error.message);
                syncStats.errors++;
            }
        }
        
        syncStats.deleted = deleted;
        
        if (deleted > 5) {
            console.log(`  🗑️  ... et ${deleted - 5} autres matchs supprimés`);
        }
        
        console.log(`  ✅ ${deleted} matchs supprimés au total`);
        
    } catch (error) {
        console.error('  ❌ Erreur nettoyage:', error.message);
        syncStats.errors++;
    }
}

// =============================================
// POINT D'ENTRÉE
// =============================================

if (require.main === module) {
    syncTodayMatches().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    syncTodayMatches
};