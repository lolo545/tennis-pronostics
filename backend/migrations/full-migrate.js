// =============================================
// MIGRATION COMPLÈTE TENNIS - VERSION PROPRE
// =============================================

const odbc = require('odbc');
const { Client } = require('pg');
require('dotenv').config();

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
    surfaces: new Map(),
    typesTournoi: new Map(),
    tiers: new Map(),
    players: new Map(),
    rounds: new Map()
};

// Statistiques
const stats = {
    courts: 0,
    rounds: 0,
    countries: 0,
    typesTournoi: 0,
    tiers: 0,
    tournamentsATP: 0,
    tournamentsWTA: 0,
    playersATP: 0,
    playersWTA: 0,
    rankingsATP: 0,
    rankingsWTA: 0,
    matchesATP: 0,
    matchesWTA: 0,
    errors: 0
};

// =============================================
// FONCTION PRINCIPALE
// =============================================

async function migrateAllData() {
    console.log('🎾 MIGRATION COMPLÈTE TENNIS');
    console.log('============================');
    console.log('');
    
    try {
        await connectDatabases();
        
        // Migration étape par étape
        await migrateCourts();
        await migrateRounds();
        await migrateCountries();
        await migrateTypesTournoi();
        
        await migrateTournaments('ATP');
        await migrateTournaments('WTA');
        
        await migratePlayers('ATP');
        await migratePlayers('WTA');
        
        await migrateRankings('ATP');
        await migrateRankings('WTA');
        
        await migrateMatches('ATP');
        await migrateMatches('WTA');
        
        await verifyResults();
        
        console.log('\n✅ MIGRATION TERMINÉE AVEC SUCCÈS !');
        
    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        process.exit(1);
    } finally {
        await closeDatabases();
    }
}

// =============================================
// CONNEXIONS
// =============================================

async function connectDatabases() {
    console.log('📡 Connexion aux bases de données...');
    
    accessDB = await odbc.connect(accessConfig.connectionString);
    console.log('  ✅ Access connecté');
    
    pgDB = new Client(pgConfig);
    await pgDB.connect();
    console.log('  ✅ PostgreSQL connecté');
}

async function closeDatabases() {
    console.log('\n🔌 Fermeture des connexions...');
    
    if (accessDB) {
        await accessDB.close();
        console.log('  ✅ Access fermé');
    }
    
    if (pgDB) {
        await pgDB.end();
        console.log('  ✅ PostgreSQL fermé');
    }
}

// =============================================
// MIGRATION DES COURTS
// =============================================

async function migrateCourts() {
    console.log('\n🏟️  Migration des surfaces...');
    
    const courts = await accessDB.query('SELECT ID_C, NAME_C FROM courts ORDER BY ID_C');
    console.log(`  📊 ${courts.length} surfaces trouvées`);
    
    for (const court of courts) {
        if (!court.NAME_C || court.NAME_C.trim() === '') continue;
        
        try {
            const result = await pgDB.query(`
                INSERT INTO court_surfaces (name) 
                VALUES ($1) 
                ON CONFLICT (name) DO NOTHING
                RETURNING id
            `, [court.NAME_C.trim()]);
            
            if (result.rows.length > 0) {
                mappings.surfaces.set(court.ID_C, result.rows[0].id);
                stats.courts++;
            } else {
                const existing = await pgDB.query('SELECT id FROM court_surfaces WHERE name = $1', [court.NAME_C.trim()]);
                if (existing.rows.length > 0) {
                    mappings.surfaces.set(court.ID_C, existing.rows[0].id);
                }
            }
        } catch (error) {
            console.error(`  ❌ Erreur surface "${court.NAME_C}":`, error.message);
            stats.errors++;
        }
    }
    
    console.log(`  ✅ ${stats.courts} surfaces migrées`);
}

// =============================================
// MIGRATION DES ROUNDS
// =============================================

async function migrateRounds() {
    console.log('\n🎯 Migration des rounds...');
    
    const rounds = await accessDB.query('SELECT ID_R, NAME_R FROM rounds ORDER BY ID_R');
    console.log(`  📊 ${rounds.length} rounds trouvés`);
    
    for (const round of rounds) {
        if (!round.NAME_R || round.NAME_R.trim() === '') continue;
        
        try {
            const isQualifying = round.NAME_R.toLowerCase().includes('qualifying');
            const displayOrder = calculateDisplayOrder(round.NAME_R);
            
            await pgDB.query(`
                INSERT INTO rounds (atp_id, name, is_qualifying, display_order)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (atp_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    is_qualifying = EXCLUDED.is_qualifying,
                    display_order = EXCLUDED.display_order
            `, [round.ID_R, round.NAME_R.trim(), isQualifying, displayOrder]);
            
            stats.rounds++;
        } catch (error) {
            console.error(`  ❌ Erreur round "${round.NAME_R}":`, error.message);
            stats.errors++;
        }
    }
    
    // Charger le mapping des rounds
    const roundsMapping = await pgDB.query('SELECT atp_id, id FROM rounds');
    for (const round of roundsMapping.rows) {
        mappings.rounds.set(round.atp_id, round.id);
    }
    
    console.log(`  ✅ ${stats.rounds} rounds migrés`);
}

// =============================================
// MIGRATION DES PAYS
// =============================================

async function migrateCountries() {
    console.log('\n🌍 Migration des pays...');
    
    const atpTournamentCountries = await accessDB.query('SELECT DISTINCT COUNTRY_T FROM tours_atp WHERE COUNTRY_T IS NOT NULL');
    const wtaTournamentCountries = await accessDB.query('SELECT DISTINCT COUNTRY_T FROM tours_wta WHERE COUNTRY_T IS NOT NULL');
    const atpPlayerCountries = await accessDB.query('SELECT DISTINCT COUNTRY_P FROM players_atp WHERE COUNTRY_P IS NOT NULL');
    const wtaPlayerCountries = await accessDB.query('SELECT DISTINCT COUNTRY_P FROM players_wta WHERE COUNTRY_P IS NOT NULL');
    
    const allCountries = new Set();
    [...atpTournamentCountries, ...wtaTournamentCountries, ...atpPlayerCountries, ...wtaPlayerCountries]
        .forEach(row => {
            const country = row.COUNTRY_T || row.COUNTRY_P;
            if (country && country.length === 3) {
                allCountries.add(country);
            }
        });
    
    console.log(`  📊 ${allCountries.size} pays uniques trouvés`);
    
    for (const countryCode of allCountries) {
        try {
            const result = await pgDB.query(`
                INSERT INTO countries (code) 
                VALUES ($1) 
                ON CONFLICT (code) DO NOTHING
                RETURNING id
            `, [countryCode]);
            
            if (result.rows.length > 0) {
                mappings.countries.set(countryCode, result.rows[0].id);
                stats.countries++;
            } else {
                const existing = await pgDB.query('SELECT id FROM countries WHERE code = $1', [countryCode]);
                if (existing.rows.length > 0) {
                    mappings.countries.set(countryCode, existing.rows[0].id);
                }
            }
        } catch (error) {
            console.error(`  ❌ Erreur pays ${countryCode}:`, error.message);
            stats.errors++;
        }
    }
    
    console.log(`  ✅ ${stats.countries} pays migrés`);
}

// =============================================
// MIGRATION DES TYPES DE TOURNOI
// =============================================

async function migrateTypesTournoi() {
    console.log('\n🏆 Migration des types de tournoi...');
    
    const existingTypes = await pgDB.query('SELECT id, id_r FROM type_tournoi');
    for (const type of existingTypes.rows) {
        mappings.typesTournoi.set(type.id_r, type.id);
    }
    
    const atpRanks = await accessDB.query('SELECT DISTINCT RANK_T FROM tours_atp WHERE RANK_T IS NOT NULL');
    const wtaRanks = await accessDB.query('SELECT DISTINCT RANK_T FROM tours_wta WHERE RANK_T IS NOT NULL');
    
    const allRanks = new Set();
    [...atpRanks, ...wtaRanks].forEach(row => {
        if (row.RANK_T !== null && row.RANK_T !== undefined) {
            allRanks.add(row.RANK_T);
        }
    });
    
    console.log(`  📊 ${allRanks.size} valeurs RANK_T: [${Array.from(allRanks).join(', ')}]`);
    
    let created = 0;
    for (const rankValue of allRanks) {
        if (!mappings.typesTournoi.has(rankValue)) {
            try {
                const defaultName = generateTypeName(rankValue);
                const defaultNom = generateTypeNom(rankValue);
                
                const result = await pgDB.query(`
                    INSERT INTO type_tournoi (id_r, nom, name)
                    VALUES ($1, $2, $3)
                    RETURNING id
                `, [rankValue, defaultNom, defaultName]);
                
                mappings.typesTournoi.set(rankValue, result.rows[0].id);
                created++;
                stats.typesTournoi++;
                
                console.log(`    ➕ Type créé: RANK_T=${rankValue} → "${defaultName}"`);
            } catch (error) {
                console.error(`    ❌ Erreur type RANK_T=${rankValue}:`, error.message);
                stats.errors++;
            }
        } else {
            stats.typesTournoi++;
        }
    }
    
    console.log(`  ✅ ${stats.typesTournoi} types prêts (${created} créés)`);
}

// =============================================
// MIGRATION DES TOURNOIS
// =============================================

async function migrateTournaments(tour) {
    console.log(`\n🏆 Migration des tournois ${tour}...`);
    
    const query = `
        SELECT ID_T, NAME_T, ID_C_T, DATE_T, RANK_T, COUNTRY_T, PRIZE_T, TIER_T
        FROM tours_${tour.toLowerCase()}
        ORDER BY DATE_T
    `;
    
    const tournaments = await accessDB.query(query);
    console.log(`  📊 ${tournaments.length} tournois ${tour} trouvés`);
    
    let processed = 0;
    let errors = 0;
    
    for (const tournament of tournaments) {
        try {
            const courtSurfaceId = mappings.surfaces.get(tournament.ID_C_T);
            const countryId = mappings.countries.get(tournament.COUNTRY_T);
            const typeTournoiId = mappings.typesTournoi.get(tournament.RANK_T);
            
            let tierTournoiId = null;
            if (tournament.TIER_T && tournament.TIER_T.trim() !== '') {
                tierTournoiId = await getOrCreateTier(tournament.TIER_T.trim());
            }
            
            const prizeData = parsePrizeMoney(tournament.PRIZE_T);
            
            await pgDB.query(`
                INSERT INTO tournaments (
                    ${tour.toLowerCase()}_id, tour, name, court_surface_id, start_date,
                    type_tournoi_id, country_id, prize_money_raw, prize_amount, 
                    prize_currency, tier_tournoi_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                tournament.ID_T, tour, tournament.NAME_T, courtSurfaceId, tournament.DATE_T,
                typeTournoiId, countryId, prizeData.raw, prizeData.amount, 
                prizeData.currency, tierTournoiId
            ]);
            
            processed++;
            
            if (processed % 100 === 0) {
                console.log(`    Progress: ${processed}/${tournaments.length} tournois`);
            }
        } catch (error) {
            errors++;
            console.error(`    ❌ Erreur tournoi "${tournament.NAME_T}":`, error.message);
        }
    }
    
    if (tour === 'ATP') stats.tournamentsATP = processed;
    else stats.tournamentsWTA = processed;
    
    console.log(`  ✅ ${processed} tournois ${tour} migrés (${errors} erreurs)`);
}

// =============================================
// MIGRATION DES JOUEURS
// =============================================

async function migratePlayers(tour) {
    console.log(`\n👤 Migration des joueurs ${tour}...`);
    
    const query = `
        SELECT 
            p.ID_P, p.NAME_P, p.DATE_P, p.COUNTRY_P,
            e.HEIGHT, e.PLAYS, e.SITE, e.PAGE, e.TWITTER, e.INSTAGRAM, e.FACEBOOK
        FROM players_${tour.toLowerCase()} p
        LEFT JOIN ep_${tour.toLowerCase()} e ON p.ID_P = e.ID_P
        WHERE p.NAME_P NOT LIKE '%/%'
        ORDER BY p.ID_P
    `;
    
    const players = await accessDB.query(query);
    console.log(`  📊 ${players.length} joueurs ${tour} trouvés`);
    
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    
    for (const player of players) {
        try {
            if (!player.NAME_P || player.NAME_P.trim() === '') {
                skipped++;
                continue;
            }
            
            const { firstName, lastName } = parsePlayerName(player.NAME_P);
            const { hand, backhand } = parsePlaysField(player.PLAYS);
            const countryId = mappings.countries.get(player.COUNTRY_P);
            
            if (!countryId) {
                skipped++;
                continue;
            }
            
            const result = await pgDB.query(`
                INSERT INTO players (
                    ${tour.toLowerCase()}_id, tour, full_name, first_name, last_name,
                    birth_date, country_id, height_cm, hand, backhand,
                    website_url, atp_page_url, twitter_handle, instagram_handle, facebook_url
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id
            `, [
                player.ID_P, tour, player.NAME_P.trim(), firstName, lastName,
                player.DATE_P, countryId, player.HEIGHT, hand, backhand,
                player.SITE, player.PAGE, player.TWITTER, player.INSTAGRAM, player.FACEBOOK
            ]);
            
            mappings.players.set(`${tour}_${player.ID_P}`, result.rows[0].id);
            processed++;
            
            if (processed % 100 === 0) {
                console.log(`    Progress: ${processed}/${players.length} joueurs`);
            }
        } catch (error) {
            errors++;
            console.error(`    ❌ Erreur joueur "${player.NAME_P}":`, error.message);
        }
    }
    
    if (tour === 'ATP') stats.playersATP = processed;
    else stats.playersWTA = processed;
    
    console.log(`  ✅ ${processed} joueurs ${tour} migrés (${errors} erreurs, ${skipped} ignorés)`);
}

// =============================================
// MIGRATION DES CLASSEMENTS
// =============================================

async function migrateRankings(tour) {
    console.log(`\n📊 Migration des classements ${tour}...`);
    
    const query = `
        SELECT r.DATE_R, r.ID_P_R, r.POINT_R, r.POS_R
        FROM ratings_${tour.toLowerCase()} r
        WHERE r.DATE_R > #2004-12-31#
        ORDER BY r.DATE_R, r.POS_R
    `;
    
    const rankings = await accessDB.query(query);
    console.log(`  📊 ${rankings.length} classements ${tour} trouvés`);
    
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    
    const batchSize = 1000;
    
    for (let i = 0; i < rankings.length; i += batchSize) {
        const batch = rankings.slice(i, i + batchSize);
        
        try {
            await pgDB.query('BEGIN');
            
            for (const ranking of batch) {
                try {
                    const playerId = mappings.players.get(`${tour}_${ranking.ID_P_R}`);
                    
                    if (!playerId || !ranking.DATE_R) {
                        skipped++;
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
            
            if (i % (batchSize * 5) === 0) {
                console.log(`    Progress: ${Math.min(i + batchSize, rankings.length)}/${rankings.length} classements`);
            }
        } catch (error) {
            await pgDB.query('ROLLBACK');
            errors += batch.length;
        }
    }
    
    if (tour === 'ATP') stats.rankingsATP = processed;
    else stats.rankingsWTA = processed;
    
    console.log(`  ✅ ${processed} classements ${tour} migrés (${errors} erreurs, ${skipped} ignorés)`);
}

// =============================================
// MIGRATION DES MATCHS
// =============================================

async function migrateMatches(tour) {
    console.log(`\n⚡ Migration des matchs ${tour}...`);
    
    const query = `
        SELECT ID1_G, ID2_G, ID_T_G, ID_R_G, RESULT_G, DATE_G
        FROM games_${tour.toLowerCase()}
        WHERE DATE_G > #2004-12-31#
        ORDER BY DATE_G
    `;
    
    const matches = await accessDB.query(query);
    console.log(`  📊 ${matches.length} matchs ${tour} trouvés`);
    
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    
    const batchSize = 500;
    
    for (let i = 0; i < matches.length; i += batchSize) {
        const batch = matches.slice(i, i + batchSize);
        
        try {
            await pgDB.query('BEGIN');
            
            for (const match of batch) {
                try {
                    const winnerId = mappings.players.get(`${tour}_${match.ID1_G}`);
                    const loserId = mappings.players.get(`${tour}_${match.ID2_G}`);
                    
                    if (!winnerId || !loserId) {
                        skipped++;
                        continue;
                    }
                    
                    const tournamentId = await getTournamentId(match.ID_T_G, tour);
                    const roundId = mappings.rounds.get(match.ID_R_G);
                    
                    if (!tournamentId || !roundId) {
                        skipped++;
                        continue;
                    }
                    
                    const scoreData = parseMatchScore(match.RESULT_G);
                    const winnerRanking = await findClosestRanking(winnerId, match.DATE_G);
                    const loserRanking = await findClosestRanking(loserId, match.DATE_G);
                    
                    await pgDB.query(`
                        INSERT INTO matches (
                            tour, winner_id, loser_id, tournament_id, round_id,
                            score_raw, match_date, sets_winner, sets_loser,
                            games_winner, games_loser, total_games, has_tiebreak,
                            tiebreaks_count, is_walkover, winner_ranking, winner_points,
                            loser_ranking, loser_points
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                    `, [
                        tour, winnerId, loserId, tournamentId, roundId,
                        match.RESULT_G, match.DATE_G, scoreData.setsWinner, scoreData.setsLoser,
                        scoreData.gamesWinner, scoreData.gamesLoser, scoreData.totalGames,
                        scoreData.hasTiebreak, scoreData.tiebreaksCount, scoreData.isWalkover,
                        winnerRanking?.position, winnerRanking?.points,
                        loserRanking?.position, loserRanking?.points
                    ]);
                    
                    processed++;
                } catch (error) {
                    errors++;
                }
            }
            
    
            await pgDB.query('COMMIT');
            
            if (i % (batchSize * 4) === 0) {
                console.log(`    Progress: ${Math.min(i + batchSize, matches.length)}/${matches.length} matchs`);
            }
        } catch (error) {
            await pgDB.query('ROLLBACK');
            errors += batch.length;
        }
    }
    
    if (tour === 'ATP') stats.matchesATP = processed;
    else stats.matchesWTA = processed;
    
    console.log(`  ✅ ${processed} matchs ${tour} migrés (${errors} erreurs, ${skipped} ignorés)`);
}

// =============================================
// FONCTIONS UTILITAIRES
// =============================================

async function getTournamentId(accessTournamentId, tour) {
    try {
        const result = await pgDB.query(`
            SELECT id FROM tournaments 
            WHERE ${tour.toLowerCase()}_id = $1 AND tour = $2
        `, [accessTournamentId, tour]);
        
        return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
        return null;
    }
}

async function findClosestRanking(playerId, matchDate) {
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
        return null;
    }
}

function parseMatchScore(scoreStr) {
    if (!scoreStr || scoreStr.trim() === '') {
        return defaultScoreData();
    }
    
    const cleanScore = scoreStr.trim();
    
    if (cleanScore.toLowerCase().includes('w/o') || 
        cleanScore.toLowerCase().includes('ret.') || 
        cleanScore.toLowerCase().includes('walkover')) {
        return { ...defaultScoreData(), isWalkover: true };
    }
    
    try {
        const sets = cleanScore.split(' ').filter(s => s.trim() !== '');
        
        let gamesWinner = 0;
        let gamesLoser = 0;
        let setsWinner = 0;
        let setsLoser = 0;
        let tiebreaksCount = 0;
        
        for (const set of sets) {
            const hasTiebreak = set.includes('(');
            if (hasTiebreak) {
                tiebreaksCount++;
            }
            
            const setMatch = set.match(/(\d+)-(\d+)/);
            if (setMatch) {
                const winnerGames = parseInt(setMatch[1]);
                const loserGames = parseInt(setMatch[2]);
                
                gamesWinner += winnerGames;
                gamesLoser += loserGames;
                
                if (winnerGames > loserGames) {
                    setsWinner++;
                } else {
                    setsLoser++;
                }
            }
        }
        
        return {
            setsWinner,
            setsLoser,
            gamesWinner,
            gamesLoser,
            totalGames: gamesWinner + gamesLoser,
            hasTiebreak: tiebreaksCount > 0,
            tiebreaksCount,
            isWalkover: false
        };
        
    } catch (error) {
        return defaultScoreData();
    }
}

function defaultScoreData() {
    return {
        setsWinner: 0,
        setsLoser: 0,
        gamesWinner: 0,
        gamesLoser: 0,
        totalGames: 0,
        hasTiebreak: false,
        tiebreaksCount: 0,
        isWalkover: false
    };
}

async function getOrCreateTier(tierCode) {
    if (mappings.tiers.has(tierCode)) {
        return mappings.tiers.get(tierCode);
    }
    
    let result = await pgDB.query('SELECT id FROM tier_tournoi WHERE code = $1', [tierCode]);
    
    if (result.rows.length > 0) {
        mappings.tiers.set(tierCode, result.rows[0].id);
        return result.rows[0].id;
    }
    
    result = await pgDB.query('INSERT INTO tier_tournoi (code) VALUES ($1) RETURNING id', [tierCode]);
    mappings.tiers.set(tierCode, result.rows[0].id);
    stats.tiers++;
    
    return result.rows[0].id;
}

function generateTypeName(rankValue) {
    const rankMap = {
        1: 'Grand Slam',
        2: 'Masters 1000',
        3: 'ATP 500', 
        4: 'ATP 250',
        5: 'Challenger',
        6: 'ITF',
        7: 'Futures',
        8: 'Davis Cup',
        9: 'Olympics'
    };
    
    return rankMap[rankValue] || `Tournament Type ${rankValue}`;
}

function generateTypeNom(rankValue) {
    const rankMap = {
        1: 'Grand Chelem',
        2: 'Masters 1000',
        3: 'ATP 500',
        4: 'ATP 250', 
        5: 'Challenger',
        6: 'ITF',
        7: 'Futures',
        8: 'Coupe Davis',
        9: 'Jeux Olympiques'
    };
    
    return rankMap[rankValue] || `Type Tournoi ${rankValue}`;
}

function calculateDisplayOrder(roundName) {
    const lowerName = roundName.toLowerCase();
    
    if (lowerName.includes('qualifying')) {
        if (lowerName.includes('first') || lowerName.includes('1st')) return -2;
        if (lowerName.includes('second') || lowerName.includes('2nd')) return -1;
        if (lowerName.includes('third') || lowerName.includes('3rd')) return -3;
        return -10;
    }
    
    if (lowerName.includes('final') && !lowerName.includes('semi')) return 7;
    if (lowerName.includes('semi')) return 6;
    if (lowerName.includes('quarter')) return 5;
    if (lowerName.includes('round of 16') || lowerName.includes('4th round')) return 4;
    if (lowerName.includes('third') || lowerName.includes('3rd')) return 3;
    if (lowerName.includes('second') || lowerName.includes('2nd')) return 2;
    if (lowerName.includes('first') || lowerName.includes('1st')) return 1;
    
    if (lowerName.includes('round of 32')) return 0;
    if (lowerName.includes('round of 64')) return -1;
    if (lowerName.includes('round of 128')) return -2;
    
    return 0;
}

function parsePlayerName(fullName) {
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) {
        return { firstName: '', lastName: parts[0] };
    }
    
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(' ');
    return { firstName, lastName };
}

function parsePlaysField(playsValue) {
    if (!playsValue || playsValue.trim() === '') {
        return { hand: null, backhand: null };
    }
    
    const parts = playsValue.split(',').map(p => p.trim());
    
    return {
        hand: parts[0] || null,
        backhand: parts[1] || null
    };
}

function parsePrizeMoney(prizeStr) {
    if (!prizeStr || prizeStr.trim() === '') {
        return { raw: prizeStr, amount: null, currency: null };
    }
    
    const match = prizeStr.match(/([€$])(\d+(?:\.\d+)?)([KM]?)/);
    if (!match) {
        return { raw: prizeStr, amount: null, currency: null };
    }
    
    const [, symbol, number, multiplier] = match;
    const currency = symbol === '€' ? 'EUR' : 'USD';
    let amount = parseFloat(number);
    
    if (multiplier === 'K') amount *= 1000;
    if (multiplier === 'M') amount *= 1000000;
    
    return { raw: prizeStr, amount, currency };
}

// =============================================
// VÉRIFICATION DES RÉSULTATS
// =============================================

async function verifyResults() {
    console.log('\n🔍 Vérification des résultats...');
    
    try {
        const counts = await pgDB.query(`
            SELECT 
                (SELECT COUNT(*) FROM court_surfaces) as surfaces,
                (SELECT COUNT(*) FROM rounds) as rounds,
                (SELECT COUNT(*) FROM countries) as countries,
                (SELECT COUNT(*) FROM tier_tournoi) as tiers,
                (SELECT COUNT(*) FROM tournaments WHERE tour = 'ATP') as tournaments_atp,
                (SELECT COUNT(*) FROM tournaments WHERE tour = 'WTA') as tournaments_wta,
                (SELECT COUNT(*) FROM players WHERE tour = 'ATP') as players_atp,
                (SELECT COUNT(*) FROM players WHERE tour = 'WTA') as players_wta,
                (SELECT COUNT(*) FROM player_rankings pr JOIN players p ON pr.player_id = p.id WHERE p.tour = 'ATP') as rankings_atp,
                (SELECT COUNT(*) FROM player_rankings pr JOIN players p ON pr.player_id = p.id WHERE p.tour = 'WTA') as rankings_wta,
                (SELECT COUNT(*) FROM matches m JOIN players p ON m.winner_id = p.id WHERE p.tour = 'ATP') as matches_atp,
                (SELECT COUNT(*) FROM matches m JOIN players p ON m.winner_id = p.id WHERE p.tour = 'WTA') as matches_wta,
                (SELECT COUNT(*) FROM tournaments) as tournaments_total,
                (SELECT COUNT(*) FROM players) as players_total,
                (SELECT COUNT(*) FROM player_rankings) as rankings_total,
                (SELECT COUNT(*) FROM matches) as matches_total
        `);
        
        const data = counts.rows[0];
        
        console.log('📊 STATISTIQUES FINALES:');
        console.log(`  🏟️  Surfaces: ${data.surfaces}`);
        console.log(`  🎯 Rounds: ${data.rounds}`);
        console.log(`  🌍 Pays: ${data.countries}`);
        console.log(`  🏷️  Tiers: ${data.tiers}`);
        console.log(`  🏆 Tournois ATP: ${data.tournaments_atp}`);
        console.log(`  🏆 Tournois WTA: ${data.tournaments_wta}`);
        console.log(`  👤 Joueurs ATP: ${data.players_atp}`);
        console.log(`  👤 Joueurs WTA: ${data.players_wta}`);
        console.log(`  📊 Classements ATP: ${data.rankings_atp}`);
        console.log(`  📊 Classements WTA: ${data.rankings_wta}`);
        console.log(`  ⚡ Matchs ATP: ${data.matches_atp}`);
        console.log(`  ⚡ Matchs WTA: ${data.matches_wta}`);
        console.log(`  📈 Total tournois: ${data.tournaments_total}`);
        console.log(`  📈 Total joueurs: ${data.players_total}`);
        console.log(`  📈 Total classements: ${data.rankings_total}`);
        console.log(`  📈 Total matchs: ${data.matches_total}`);
        
        // Exemples de joueurs
        console.log('\n👤 Exemples de joueurs migrés:');
        const playerExamples = await pgDB.query(`
            SELECT p.full_name, p.tour, c.code as country, p.hand, p.height_cm
            FROM players p
            LEFT JOIN countries c ON p.country_id = c.id
            ORDER BY p.id
            LIMIT 5
        `);
        
        playerExamples.rows.forEach(player => {
            const height = player.height_cm ? `${player.height_cm}cm` : 'N/A';
            const hand = player.hand || 'N/A';
            console.log(`  - ${player.full_name} (${player.tour}) - ${player.country} - ${hand} - ${height}`);
        });
        
        // Top 5 pays
        console.log('\n🌍 Top 5 pays par nombre de joueurs:');
        const countryStats = await pgDB.query(`
            SELECT c.code, COUNT(*) as count
            FROM players p
            JOIN countries c ON p.country_id = c.id
            GROUP BY c.code
            ORDER BY count DESC
            LIMIT 5
        `);
        
        countryStats.rows.forEach(stat => {
            console.log(`  - ${stat.code}: ${stat.count} joueurs`);
        });
        
        // Statistiques des matchs
        if (data.matches_total > 0) {
            console.log('\n⚡ Statistiques des matchs:');
            const matchStats = await pgDB.query(`
                SELECT 
                    COUNT(*) as total_matches,
                    MIN(match_date) as first_match,
                    MAX(match_date) as last_match,
                    COUNT(CASE WHEN is_walkover = true THEN 1 END) as total_walkovers,
                    COUNT(CASE WHEN has_tiebreak = true THEN 1 END) as total_tiebreaks,
                    AVG(total_games) as avg_games
                FROM matches
            `);
            
            if (matchStats.rows.length > 0) {
                const matchData = matchStats.rows[0];
                console.log(`  📅 Période: ${matchData.first_match} à ${matchData.last_match}`);
                console.log(`  🎾 ${matchData.total_matches.toLocaleString()} matchs total`);
                console.log(`  🚶 ${matchData.total_walkovers} abandons/forfaits`);
                console.log(`  🔥 ${matchData.total_tiebreaks} matchs avec tie-breaks`);
                console.log(`  📊 ${parseFloat(matchData.avg_games).toFixed(1)} jeux en moyenne`);
            }
            
            // Exemples de matchs récents
            console.log('\n🏆 Exemples de matchs récents:');
            const recentMatches = await pgDB.query(`
                SELECT 
                    pw.full_name as winner_name,
                    pl.full_name as loser_name,
                    m.score_raw,
                    m.match_date,
                    t.name as tournament_name
                FROM matches m
                JOIN players pw ON m.winner_id = pw.id
                JOIN players pl ON m.loser_id = pl.id
                JOIN tournaments t ON m.tournament_id = t.id
                ORDER BY m.match_date DESC
                LIMIT 3
            `);
            
            recentMatches.rows.forEach(match => {
                console.log(`  - ${match.winner_name} def. ${match.loser_name} ${match.score_raw} - ${match.tournament_name} (${match.match_date})`);
            });
        }
        
    } catch (error) {
        console.error('  ❌ Erreur vérification:', error.message);
    }
}

// =============================================
// EXÉCUTION
// =============================================

if (require.main === module) {
    migrateAllData().catch(error => {
        console.error('❌ ERREUR FATALE:', error);
        process.exit(1);
    });
}

module.exports = { migrateAllData };