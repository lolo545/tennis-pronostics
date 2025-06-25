// =============================================
// SYNCHRONISATION INCRÉMENTALE TENNIS
// =============================================

const { Client } = require('pg');
const schedule = require('node-schedule');
const syncMonitoring = require('../src/services/syncMonitoring');
require('dotenv').config();

// Logger simple pour la synchronisation
const logger = {
    info: (message) => console.log(`ℹ️  ${message}`),
    warn: (message) => console.warn(`⚠️  ${message}`),
    error: (message, error) => {
        console.error(`❌ ${message}`);
        if (error) console.error(error);
    }
};

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
    countries: new Map(),
    players: new Map(),
    tournaments: new Map()
};

// Statistiques de synchronisation
const syncStats = {
    tournamentsATP: 0,
    tournamentsWTA: 0,
    rankingsATP: 0,
    rankingsWTA: 0,
    matchesATP: 0,
    matchesWTA: 0,
    oddsATP: 0,
    oddsWTA: 0,
    errors: 0,
    startTime: null,
    endTime: null
};

// =============================================
// FONCTION PRINCIPALE DE SYNCHRONISATION
// =============================================

async function performSync() {
    console.log('\n🔄 SYNCHRONISATION INCRÉMENTALE TENNIS');
    console.log('=======================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    syncStats.startTime = Date.now();
    let sessionId = null;
    
    try {
        // Initialiser le monitoring
        await syncMonitoring.initializeMonitoring();
        
        await connectDatabases();
        await loadMappings();
        
        // Déterminer la date de dernière synchronisation
        const lastSync = await getLastSyncDate();
        console.log(`📅 Dernière sync: ${lastSync ? lastSync.toLocaleDateString('fr-FR') : 'Première synchronisation'}`);
        
        // Démarrer une session de monitoring
        sessionId = await syncMonitoring.startSyncSession('incremental', lastSync);
        
        // Synchroniser les nouvelles données
        await syncTournaments('ATP', lastSync, sessionId);
        await syncTournaments('WTA', lastSync, sessionId);
        
        await syncRankings('ATP', lastSync, sessionId);
        await syncRankings('WTA', lastSync, sessionId);
        
        await syncMatches('ATP', lastSync, sessionId);
        await syncMatches('WTA', lastSync, sessionId);
        
        await syncOdds('ATP', lastSync, sessionId);
        await syncOdds('WTA', lastSync, sessionId);
        
        // Enregistrer la date de synchronisation
        await updateSyncDate();
        
        syncStats.endTime = Date.now();
        const duration = Math.round((syncStats.endTime - syncStats.startTime) / 1000);
        
        console.log('\n✅ SYNCHRONISATION TERMINÉE');
        console.log(`⏱️  Durée: ${duration}s`);
        console.log(`📊 Résumé:`);
        console.log(`   - Tournois ATP: ${syncStats.tournamentsATP}`);
        console.log(`   - Tournois WTA: ${syncStats.tournamentsWTA}`);
        console.log(`   - Classements ATP: ${syncStats.rankingsATP}`);
        console.log(`   - Classements WTA: ${syncStats.rankingsWTA}`);
        console.log(`   - Matchs ATP: ${syncStats.matchesATP}`);
        console.log(`   - Matchs WTA: ${syncStats.matchesWTA}`);
        console.log(`   - Cotes ATP: ${syncStats.oddsATP}`);
        console.log(`   - Cotes WTA: ${syncStats.oddsWTA}`);
        console.log(`   - Erreurs: ${syncStats.errors}`);
        
        // Terminer la session de monitoring avec succès
        if (sessionId) {
            await syncMonitoring.endSyncSession(sessionId, 'completed', syncStats);
        }
        
    } catch (error) {
        console.error('\n❌ ERREUR SYNCHRONISATION:', error.message);
        syncStats.errors++;
        
        // Terminer la session de monitoring avec erreur
        if (sessionId) {
            await syncMonitoring.endSyncSession(sessionId, 'failed', syncStats, error.message);
        }
        
        throw error;
        
    } finally {
        await closeDatabases();
    }
}

// =============================================
// CONNEXIONS ET MAPPINGS
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

async function loadMappings() {
    console.log('🗂️  Chargement des mappings...');
    
    // Charger les pays
    const countries = await pgDB.query('SELECT id, code FROM countries');
    countries.rows.forEach(country => {
        mappings.countries.set(country.code, country.id);
    });
    
    // Charger les joueurs ATP
    const playersATP = await pgDB.query('SELECT id, atp_id FROM players WHERE tour = \'ATP\' AND atp_id IS NOT NULL');
    playersATP.rows.forEach(player => {
        mappings.players.set(`ATP_${player.atp_id}`, player.id);
    });
    
    // Charger les joueurs WTA
    const playersWTA = await pgDB.query('SELECT id, wta_id FROM players WHERE tour = \'WTA\' AND wta_id IS NOT NULL');
    playersWTA.rows.forEach(player => {
        mappings.players.set(`WTA_${player.wta_id}`, player.id);
    });
    
    console.log(`  ✅ ${mappings.countries.size} pays, ${playersATP.rows.length} joueurs ATP, ${playersWTA.rows.length} joueurs WTA`);
}

// =============================================
// GESTION DES DATES DE SYNCHRONISATION
// =============================================

async function getLastSyncDate() {
    try {
        const result = await pgDB.query(`
            SELECT last_sync_date 
            FROM sync_log 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        
        return result.rows.length > 0 ? result.rows[0].last_sync_date : null;
    } catch (error) {
        // Si la table n'existe pas, la créer
        await pgDB.query(`
            CREATE TABLE IF NOT EXISTS sync_log (
                id SERIAL PRIMARY KEY,
                last_sync_date TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_stats JSONB
            )
        `);
        
        return null;
    }
}

async function updateSyncDate() {
    // Cette fonction est maintenant gérée par syncMonitoring
    // Nous n'avons plus besoin de créer une entrée séparée
    console.log('📅 Date de synchronisation mise à jour');
}

// =============================================
// SYNCHRONISATION DES TOURNOIS
// =============================================

async function syncTournaments(tour, lastSync, sessionId = null) {
    console.log(`\n🏆 Synchronisation tournois ${tour}...`);
    
    if (!accessDB) {
        console.log(`  ⚠️  Pas de connexion Access, synchronisation ignorée`);
        return;
    }
    
    // Utiliser DateValue pour le format de date Access
    const formatDateForAccess = (date) => {
        const d = new Date(date);
        return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
    };
    
    const whereClause = lastSync 
        ? `WHERE t.DATE_T > DateValue('${formatDateForAccess(lastSync)}')`
        : `WHERE t.DATE_T >= DateValue('${formatDateForAccess(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))}')`;
    
    const query = `
        SELECT t.ID_T, t.NAME_T, t.COUNTRY_T, t.DATE_T, t.RANK_T, t.ID_C_T
        FROM tours_${tour.toLowerCase()} t
        ${whereClause}
        ORDER BY t.DATE_T DESC
    `;
    
    try {
        const tournaments = await accessDB.query(query);
        console.log(`  📊 ${tournaments.length} tournois ${tour} à synchroniser`);
        
        let processed = 0;
        let errors = 0;
        
        for (const tournament of tournaments) {
            try {
                const countryId = mappings.countries.get(tournament.COUNTRY_T);
                
                if (!countryId) {
                    errors++;
                    continue;
                }
                
                const surfaceId = await getSurfaceId(tournament.ID_C_T);
                const typeId = await getTypeId(tournament.RANK_T);
                
                // Vérifier si le tournoi existe déjà
                const existingTournament = await pgDB.query(`
                    SELECT id FROM tournaments WHERE ${tour.toLowerCase()}_id = $1
                `, [tournament.ID_T]);
                
                if (existingTournament.rows.length > 0) {
                    // Mettre à jour le tournoi existant
                    await pgDB.query(`
                        UPDATE tournaments SET 
                            name = $2,
                            country_id = $3,
                            start_date = $4,
                            type_tournoi_id = $5,
                            court_surface_id = $6
                        WHERE ${tour.toLowerCase()}_id = $1
                    `, [
                        tournament.ID_T, tournament.NAME_T, countryId,
                        tournament.DATE_T, typeId, surfaceId
                    ]);
                } else {
                    // Insérer un nouveau tournoi
                    await pgDB.query(`
                        INSERT INTO tournaments (
                            ${tour.toLowerCase()}_id, tour, name, country_id, 
                            start_date, type_tournoi_id, court_surface_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        tournament.ID_T, tour, tournament.NAME_T,
                        countryId, tournament.DATE_T, typeId, surfaceId
                    ]);
                }
                
                processed++;
                
            } catch (error) {
                errors++;
                console.error(`    ❌ Erreur tournoi "${tournament.NAME_T}":`, error.message);
                if (error.message.includes('violates foreign key constraint')) {
                    console.error(`      🔍 Probablement un problème de mapping avec pays/surface/type`);
                }
            }
        }
        
        if (tour === 'ATP') syncStats.tournamentsATP = processed;
        else syncStats.tournamentsWTA = processed;
        
        console.log(`  ✅ ${processed} tournois ${tour} synchronisés (${errors} erreurs)`);
        
    } catch (error) {
        console.error(`  ❌ Erreur sync tournois ${tour}:`, error.message);
        syncStats.errors++;
    }
}

// =============================================
// SYNCHRONISATION DES CLASSEMENTS
// =============================================

async function syncRankings(tour, lastSync, sessionId = null) {
    console.log(`\n📊 Synchronisation classements ${tour}...`);
    
    if (!accessDB) {
        console.log(`  ⚠️  Pas de connexion Access, synchronisation ignorée`);
        return;
    }
    
    const whereClause = lastSync 
        ? `WHERE r.DATE_R > #${lastSync.toISOString().split('T')[0]}#`
        : `WHERE r.DATE_R >= #${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}#`;
    
    const query = `
        SELECT r.DATE_R, r.ID_P_R, r.POINT_R, r.POS_R
        FROM ratings_${tour.toLowerCase()} r
        ${whereClause}
        ORDER BY r.DATE_R DESC, r.POS_R
    `;
    
    try {
        const rankings = await accessDB.query(query);
        console.log(`  📊 ${rankings.length} classements ${tour} à synchroniser`);
        
        let processed = 0;
        let errors = 0;
        
        const batchSize = 1000;
        
        for (let i = 0; i < rankings.length; i += batchSize) {
            const batch = rankings.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const ranking of batch) {
                    try {
                        const playerId = mappings.players.get(`${tour}_${ranking.ID_P_R}`);
                        
                        if (!playerId || !ranking.DATE_R) {
                            continue;
                        }
                        
                        await pgDB.query(`
                            INSERT INTO player_rankings (ranking_date, player_id, points, position)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (player_id, ranking_date) DO UPDATE SET
                                points = EXCLUDED.points,
                                position = EXCLUDED.position
                        `, [ranking.DATE_R, playerId, ranking.POINT_R, ranking.POS_R]);
                        
                        processed++;
                        
                    } catch (error) {
                        errors++;
                    }
                }
                
                await pgDB.query('COMMIT');
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                errors += batch.length;
            }
        }
        
        if (tour === 'ATP') syncStats.rankingsATP = processed;
        else syncStats.rankingsWTA = processed;
        
        console.log(`  ✅ ${processed} classements ${tour} synchronisés (${errors} erreurs)`);
        
    } catch (error) {
        console.error(`  ❌ Erreur sync classements ${tour}:`, error.message);
        syncStats.errors++;
    }
}

// =============================================
// SYNCHRONISATION DES MATCHS
// =============================================

async function syncMatches(tour, lastSync, sessionId = null) {
    console.log(`\n🎾 Synchronisation matchs ${tour}...`);
    
    if (!accessDB) {
        console.log(`  ⚠️  Pas de connexion Access, synchronisation ignorée`);
        return;
    }
    
    // Utiliser DateValue pour le format de date Access
    const formatDateForAccess = (date) => {
        const d = new Date(date);
        return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
    };
    
    const whereClause = lastSync 
        ? `WHERE m.DATE_G > DateValue('${formatDateForAccess(lastSync)}')`
        : `WHERE m.DATE_G >= DateValue('${formatDateForAccess(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))}')`;
    
    const query = `
        SELECT m.ID1_G, m.ID2_G, m.ID_T_G, m.ID_R_G, m.RESULT_G, m.DATE_G
        FROM games_${tour.toLowerCase()} m
        ${whereClause}
        ORDER BY m.DATE_G DESC
    `;
    
    try {
        const matches = await accessDB.query(query);
        console.log(`  📊 ${matches.length} matchs ${tour} à synchroniser`);
        
        let processed = 0;
        let errors = 0;
        
        const batchSize = 500;
        
        for (let i = 0; i < matches.length; i += batchSize) {
            const batch = matches.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const match of batch) {
                    try {
                        // Les joueurs sont identifiés par ID1_G et ID2_G
                        const player1Id = mappings.players.get(`${tour}_${match.ID1_G}`);
                        const player2Id = mappings.players.get(`${tour}_${match.ID2_G}`);
                        
                        if (!player1Id || !player2Id || !match.DATE_G) {
                            continue;
                        }
                        
                        // Obtenir l'ID du tournoi PostgreSQL
                        const tournamentResult = await pgDB.query(
                            `SELECT id FROM tournaments WHERE ${tour.toLowerCase()}_id = $1`,
                            [match.ID_T_G]
                        );
                        
                        if (tournamentResult.rows.length === 0) {
                            continue;
                        }
                        
                        const tournamentId = tournamentResult.rows[0].id;
                        
                        // Obtenir l'ID du round
                        const roundResult = await pgDB.query(
                            `SELECT id FROM rounds WHERE atp_id = $1`,
                            [match.ID_R_G]
                        );
                        
                        if (roundResult.rows.length === 0) {
                            continue;
                        }
                        
                        const roundId = roundResult.rows[0].id;
                        
                        // Dans Access, ID1_G est toujours le vainqueur, ID2_G est toujours le perdant
                        const winnerId = player1Id;  // ID1_G = vainqueur
                        const loserId = player2Id;   // ID2_G = perdant
                        
                        // Récupérer les classements des joueurs à la date du match
                        const winnerRanking = await findClosestRanking(winnerId, match.DATE_G);
                        const loserRanking = await findClosestRanking(loserId, match.DATE_G);
                        
                        // Parser le score pour extraire les détails
                        const scoreData = parseScore(match.RESULT_G);
                        
                        // Vérifier si le match existe déjà (clé composite)
                        const existingMatch = await pgDB.query(`
                            SELECT id FROM matches 
                            WHERE tournament_id = $1 
                              AND match_date = $2 
                              AND ((winner_id = $3 AND loser_id = $4) OR (winner_id = $4 AND loser_id = $3))
                              AND round_id = $5
                        `, [tournamentId, match.DATE_G, player1Id, player2Id, roundId]);
                        
                        if (existingMatch.rows.length > 0) {
                            // Mettre à jour le match existant avec les classements et détails du score
                            await pgDB.query(`
                                UPDATE matches SET 
                                    winner_id = $2,
                                    loser_id = $3,
                                    score_raw = $4,
                                    winner_ranking = $5,
                                    winner_points = $6,
                                    loser_ranking = $7,
                                    loser_points = $8,
                                    sets_winner = $9,
                                    sets_loser = $10,
                                    total_sets = $11,
                                    games_winner = $12,
                                    games_loser = $13,
                                    total_games = $14,
                                    has_tiebreak = $15,
                                    tiebreaks_count = $16,
                                    is_walkover = $17
                                WHERE id = $1
                            `, [
                                existingMatch.rows[0].id, winnerId, loserId, match.RESULT_G,
                                winnerRanking?.position, winnerRanking?.points,
                                loserRanking?.position, loserRanking?.points,
                                scoreData.sets_winner, scoreData.sets_loser, scoreData.total_sets,
                                scoreData.games_winner, scoreData.games_loser, scoreData.total_games,
                                scoreData.has_tiebreak, scoreData.tiebreaks_count, scoreData.is_walkover
                            ]);
                        } else {
                            // Insérer un nouveau match avec les classements et détails du score
                            await pgDB.query(`
                                INSERT INTO matches (
                                    tour, tournament_id, match_date, winner_id, loser_id,
                                    score_raw, round_id, winner_ranking, winner_points,
                                    loser_ranking, loser_points, sets_winner, sets_loser, total_sets,
                                    games_winner, games_loser, total_games, has_tiebreak,
                                    tiebreaks_count, is_walkover
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                            `, [
                                tour, tournamentId, match.DATE_G, winnerId, loserId,
                                match.RESULT_G, roundId, winnerRanking?.position, winnerRanking?.points,
                                loserRanking?.position, loserRanking?.points, scoreData.sets_winner, scoreData.sets_loser, 
                                scoreData.total_sets, scoreData.games_winner, scoreData.games_loser, scoreData.total_games,
                                scoreData.has_tiebreak, scoreData.tiebreaks_count, scoreData.is_walkover
                            ]);
                        }
                        
                        processed++;
                        
                    } catch (error) {
                        errors++;
                        console.error(`    ❌ Erreur match ${match.ID1_G} vs ${match.ID2_G}:`, error.message);
                    }
                }
                
                await pgDB.query('COMMIT');
                
                if (i % (batchSize * 5) === 0) {
                    console.log(`    Progress: ${Math.min(i + batchSize, matches.length)}/${matches.length} matchs`);
                }
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                errors += batch.length;
            }
        }
        
        if (tour === 'ATP') syncStats.matchesATP = processed;
        else syncStats.matchesWTA = processed;
        
        console.log(`  ✅ ${processed} matchs ${tour} synchronisés (${errors} erreurs)`);
        
    } catch (error) {
        console.error(`  ❌ Erreur sync matchs ${tour}:`, error.message);
        syncStats.errors++;
    }
}

// =============================================
// SYNCHRONISATION DES COTES
// =============================================

async function syncOdds(tour, lastSync, sessionId = null) {
    console.log(`\n💰 Synchronisation cotes ${tour}...`);
    
    if (!accessDB) {
        console.log(`  ⚠️  Pas de connexion Access, synchronisation ignorée`);
        return;
    }
    
    // Pour les cotes, on peut utiliser une logique plus simple car elles ne changent pas souvent
    // On prend les cotes récentes (derniers 3 mois) pour mettre à jour les matchs qui n'ont pas de cotes
    const query = `
        SELECT o.ID1_O, o.ID2_O, o.ID_T_O, o.ID_R_O, o.K1, o.K2
        FROM odds_${tour.toLowerCase()} o
        WHERE o.ID_B_O = 2
    `;
    
    try {
        const odds = await accessDB.query(query);
        console.log(`  📊 ${odds.length} cotes ${tour} trouvées à synchroniser`);
        
        let processed = 0;
        let updated = 0;
        let errors = 0;
        let notFound = 0;
        
        const batchSize = 200;
        
        for (let i = 0; i < odds.length; i += batchSize) {
            const batch = odds.slice(i, i + batchSize);
            
            try {
                await pgDB.query('BEGIN');
                
                for (const odd of batch) {
                    try {
                        // Trouver le match correspondant
                        const match = await findMatchForOdds(odd, tour);
                        
                        if (!match) {
                            notFound++;
                            continue;
                        }
                        
                        // Vérifier si le match a déjà des cotes
                        if (match.winner_odds && match.loser_odds) {
                            continue;
                        }
                        
                        // Calculer les cotes winner/loser
                        const oddsData = calculateWinnerLoserOdds(odd, match);
                        
                        if (!oddsData) {
                            errors++;
                            continue;
                        }
                        
                        // Mettre à jour le match avec les cotes
                        const updateResult = await pgDB.query(`
                            UPDATE matches 
                            SET winner_odds = $1, loser_odds = $2
                            WHERE id = $3 AND (winner_odds IS NULL OR loser_odds IS NULL)
                        `, [oddsData.winnerOdds, oddsData.loserOdds, match.id]);
                        
                        if (updateResult.rowCount > 0) {
                            updated++;
                        }
                        
                        processed++;
                        
                    } catch (error) {
                        errors++;
                        if (errors <= 3) {
                            console.error(`    ❌ Erreur cote ${odd.ID1_O} vs ${odd.ID2_O}:`, error.message);
                        }
                    }
                }
                
                await pgDB.query('COMMIT');
                
                if (i % (batchSize * 5) === 0) {
                    console.log(`    Progress: ${Math.min(i + batchSize, odds.length)}/${odds.length} cotes`);
                }
                
            } catch (error) {
                await pgDB.query('ROLLBACK');
                errors += batch.length;
                console.error(`    ❌ Erreur lot cotes ${i}-${i + batchSize}:`, error.message);
            }
        }
        
        if (tour === 'ATP') syncStats.oddsATP = updated;
        else syncStats.oddsWTA = updated;
        
        console.log(`  ✅ ${processed} cotes ${tour} traitées, ${updated} matchs mis à jour (${notFound} non trouvées, ${errors} erreurs)`);
        
    } catch (error) {
        console.error(`  ❌ Erreur sync cotes ${tour}:`, error.message);
        syncStats.errors++;
    }
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function getSurfaceId(surfaceIdFromAccess) {
    if (!surfaceIdFromAccess) return null;
    
    try {
        // ID_C_T dans Access correspond à l'ID des surfaces
        const result = await pgDB.query('SELECT id FROM court_surfaces WHERE id = $1', [surfaceIdFromAccess]);
        return result.rows.length > 0 ? result.rows[0].id : null; // Return null if not found
    } catch (error) {
        console.error(`Erreur récupération surface ${surfaceIdFromAccess}:`, error.message);
        return null;
    }
}

async function getTypeId(rankT) {
    if (!rankT) return null;
    
    try {
        // RANK_T dans Access correspond à id_r dans type_tournoi
        const result = await pgDB.query('SELECT id FROM type_tournoi WHERE id_r = $1', [rankT]);
        return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
        return null;
    }
}

async function getTierId(tierName) {
    if (!tierName) return null;
    
    try {
        const result = await pgDB.query('SELECT id FROM tiers WHERE name = $1', [tierName]);
        return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
        return null;
    }
}

async function getRoundId(roundName) {
    if (!roundName) return null;
    
    try {
        const result = await pgDB.query('SELECT id FROM rounds WHERE name = $1', [roundName]);
        return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
        return null;
    }
}

async function findClosestRanking(playerId, matchDate) {
    if (!playerId || !matchDate) return null;
    
    try {
        const result = await pgDB.query(`
            SELECT position, points
            FROM player_rankings 
            WHERE player_id = $1 AND ranking_date <= $2
            ORDER BY ranking_date DESC 
            LIMIT 1
        `, [playerId, matchDate]);
        
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error(`Erreur récupération classement joueur ${playerId}:`, error.message);
        return null;
    }
}

async function findMatchForOdds(odd, tour) {
    try {
        // Stratégie 1: Recherche directe par joueurs, tournoi et round
        let match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.winner_odds,
                m.loser_odds,
                pw.${tour.toLowerCase()}_id as winner_access_id,
                pl.${tour.toLowerCase()}_id as loser_access_id
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id AND pw.tour = $1
            JOIN players pl ON m.loser_id = pl.id AND pl.tour = $1
            JOIN tournaments t ON m.tournament_id = t.id AND t.${tour.toLowerCase()}_id = $2 AND t.tour = $1
            JOIN rounds r ON m.round_id = r.id AND r.atp_id = $3
            WHERE ((pw.${tour.toLowerCase()}_id = $4 AND pl.${tour.toLowerCase()}_id = $5) OR 
                   (pw.${tour.toLowerCase()}_id = $5 AND pl.${tour.toLowerCase()}_id = $4))
        `, [tour, odd.ID_T_O, odd.ID_R_O, odd.ID1_O, odd.ID2_O]);
        
        if (match.rows.length > 0) {
            return match.rows[0];
        }
        
        // Stratégie 2: Recherche sans le round (au cas où il y aurait des incohérences)
        match = await pgDB.query(`
            SELECT 
                m.id,
                m.winner_id,
                m.loser_id,
                m.winner_odds,
                m.loser_odds,
                pw.${tour.toLowerCase()}_id as winner_access_id,
                pl.${tour.toLowerCase()}_id as loser_access_id
            FROM matches m
            JOIN players pw ON m.winner_id = pw.id AND pw.tour = $1
            JOIN players pl ON m.loser_id = pl.id AND pl.tour = $1
            JOIN tournaments t ON m.tournament_id = t.id AND t.${tour.toLowerCase()}_id = $2 AND t.tour = $1
            WHERE ((pw.${tour.toLowerCase()}_id = $3 AND pl.${tour.toLowerCase()}_id = $4) OR 
                   (pw.${tour.toLowerCase()}_id = $4 AND pl.${tour.toLowerCase()}_id = $3))
        `, [tour, odd.ID_T_O, odd.ID1_O, odd.ID2_O]);
        
        return match.rows.length > 0 ? match.rows[0] : null;
        
    } catch (error) {
        console.error(`Erreur recherche match pour cotes:`, error.message);
        return null;
    }
}

function calculateWinnerLoserOdds(odd, match) {
    try {
        // Vérifier la validité des cotes
        const k1 = parseFloat(odd.K1);
        const k2 = parseFloat(odd.K2);
        
        if (isNaN(k1) || isNaN(k2) || k1 <= 0 || k2 <= 0) {
            return null;
        }
        
        // Déterminer qui est ID1_O et ID2_O par rapport au winner/loser du match
        let winnerOdds, loserOdds;
        
        if (match.winner_access_id === odd.ID1_O && match.loser_access_id === odd.ID2_O) {
            // ID1_O = winner, ID2_O = loser
            winnerOdds = k1;
            loserOdds = k2;
        } else if (match.winner_access_id === odd.ID2_O && match.loser_access_id === odd.ID1_O) {
            // ID2_O = winner, ID1_O = loser
            winnerOdds = k2;
            loserOdds = k1;
        } else {
            // Cas d'erreur dans les données
            return null;
        }
        
        // Arrondir à 3 décimales
        return {
            winnerOdds: Math.round(winnerOdds * 1000) / 1000,
            loserOdds: Math.round(loserOdds * 1000) / 1000
        };
        
    } catch (error) {
        return null;
    }
}

// =============================================
// FONCTIONS DE PARSING DES SCORES
// =============================================

function parseScore(scoreStr) {
    if (!scoreStr || scoreStr.trim() === '') {
        return getDefaultScoreData();
    }
    
    const score = scoreStr.trim();
    
    // Vérifier si c'est un abandon/walkover
    if (isWalkover(score)) {
        return {
            sets_winner: null,
            sets_loser: null,
            total_sets: null,
            games_winner: null,
            games_loser: null,
            total_games: null,
            has_tiebreak: false,
            tiebreaks_count: 0,
            is_walkover: true
        };
    }
    
    // Parser le score normal
    return parseNormalScore(score);
}

function getDefaultScoreData() {
    return {
        sets_winner: null,
        sets_loser: null,
        total_sets: null,
        games_winner: null,
        games_loser: null,
        total_games: null,
        has_tiebreak: false,
        tiebreaks_count: 0,
        is_walkover: false
    };
}

function isWalkover(score) {
    const walkoverPatterns = [
        /w\.?o\.?/i,      // W.O., WO, w.o., wo
        /walkover/i,      // Walkover
        /def\.?/i,        // DEF, def
        /abd\.?/i,        // ABD, abd (abandoned)
        /ret\.?/i,        // RET, ret (retired)
        /retired/i,       // Retired
        /abandon/i,       // Abandon, abandoned
        /withdrawal/i,    // Withdrawal
        /scratch/i        // Scratch
    ];
    
    return walkoverPatterns.some(pattern => pattern.test(score));
}

function parseNormalScore(score) {
    try {
        // Diviser en sets (par espaces)
        const sets = score.split(/\s+/).filter(set => set.length > 0);
        
        let setsWinner = 0;
        let setsLoser = 0;
        let gamesWinner = 0;
        let gamesLoser = 0;
        let totalGames = 0;
        let hasTiebreak = false;
        let tiebreaksCount = 0;
        
        for (const setStr of sets) {
            const setData = parseSet(setStr);
            if (setData) {
                // Déterminer qui a gagné ce set
                if (setData.games1 > setData.games2) {
                    setsWinner++;
                    gamesWinner += setData.games1;
                    gamesLoser += setData.games2;
                } else if (setData.games2 > setData.games1) {
                    setsLoser++;
                    gamesWinner += setData.games2;
                    gamesLoser += setData.games1;
                } else {
                    // Cas d'égalité (ne devrait pas arriver au tennis)
                    gamesWinner += setData.games1;
                    gamesLoser += setData.games2;
                }
                
                totalGames += setData.games1 + setData.games2;
                
                if (setData.hasTiebreak) {
                    hasTiebreak = true;
                    tiebreaksCount++;
                }
            }
        }
        
        return {
            sets_winner: setsWinner,
            sets_loser: setsLoser,
            total_sets: setsWinner + setsLoser,
            games_winner: gamesWinner,
            games_loser: gamesLoser,
            total_games: totalGames,
            has_tiebreak: hasTiebreak,
            tiebreaks_count: tiebreaksCount,
            is_walkover: false
        };
        
    } catch (error) {
        console.error('Erreur parsing score:', score, error.message);
        return getDefaultScoreData();
    }
}

function parseSet(setStr) {
    try {
        // Supprimer les espaces
        const cleanSet = setStr.trim();
        
        // Vérifier s'il y a un tie-break (entre parenthèses)
        const tiebreakMatch = cleanSet.match(/\((\d+)\)/);
        const hasTiebreak = !!tiebreakMatch;
        
        // Extraire les jeux (avant les parenthèses s'il y en a)
        const gamesStr = cleanSet.replace(/\s*\([^)]*\)\s*/, '');
        
        // Parser les jeux (format: "6-4", "7-6", etc.)
        const gamesMatch = gamesStr.match(/^(\d+)-(\d+)$/);
        if (!gamesMatch) {
            return null;
        }
        
        const games1 = parseInt(gamesMatch[1]);
        const games2 = parseInt(gamesMatch[2]);
        
        return {
            games1,
            games2,
            hasTiebreak
        };
        
    } catch (error) {
        return null;
    }
}

// =============================================
// PLANIFICATION DES TÂCHES
// =============================================

function startScheduledSync() {
    console.log('🕐 Démarrage du planificateur de synchronisation...');
    
    // Synchronisation 2 fois par jour : 06:00 et 18:00
    schedule.scheduleJob('0 6,18 * * *', async () => {
        console.log('\n⏰ Synchronisation automatique déclenchée');
        await performSync();
    });
    
    console.log('✅ Planificateur configuré : synchronisation quotidienne à 06:00 et 18:00');
}

// =============================================
// POINTS D'ENTRÉE
// =============================================

// Synchronisation manuelle
if (require.main === module) {
    const command = process.argv[2];
    
    if (command === 'start-scheduler') {
        startScheduledSync();
        console.log('🚀 Planificateur démarré. Appuyez sur Ctrl+C pour arrêter.');
    } else {
        // Synchronisation manuelle immédiate
        performSync().then(() => {
            process.exit(0);
        }).catch((error) => {
            console.error('Erreur:', error.message);
            process.exit(1);
        });
    }
}

module.exports = {
    performSync,
    startScheduledSync
};