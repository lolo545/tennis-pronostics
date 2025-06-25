// =============================================
// ROUTES API - JOUEURS
// =============================================

const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     Player:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         full_name:
 *           type: string
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         tour:
 *           type: string
 *           enum: [ATP, WTA]
 *         country:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *         birth_date:
 *           type: string
 *           format: date
 *         height_cm:
 *           type: integer
 *         hand:
 *           type: string
 *         backhand:
 *           type: string
 */

/**
 * @swagger
 * /api/v1/players/tournament-types:
 *   get:
 *     summary: Récupère la liste des types de tournoi disponibles
 *     tags: [Players]
 *     responses:
 *       200:
 *         description: Liste des types de tournoi
 */
router.get('/tournament-types', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT tt.name
            FROM type_tournoi tt
            JOIN tournaments t ON tt.id = t.type_tournoi_id
            WHERE tt.name IS NOT NULL
            ORDER BY tt.name
        `;

        const result = await sequelize.query(query, {
            type: sequelize.QueryTypes.SELECT
        });

        const types = result.map(row => row.name);

        res.json({ tournament_types: types });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les types de tournoi'
        });
    }
});

/**
 * @swagger
 * /api/v1/players/{id}:
 *   get:
 *     summary: Récupère les informations d'un joueur par ID
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du joueur
 *     responses:
 *       200:
 *         description: Informations du joueur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 *       404:
 *         description: Joueur non trouvé
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Requête pour récupérer les infos de base du joueur avec son pays
        const query = `
            SELECT
                p.id,
                p.full_name,
                p.first_name,
                p.last_name,
                p.tour,
                c.code as country_code
            FROM players p
                     LEFT JOIN countries c ON p.country_id = c.id
            WHERE p.id = ?
        `;

        const result = await sequelize.query(query, {
            replacements: [id],
            type: sequelize.QueryTypes.SELECT
        });

        if (result.length === 0) {
            return res.status(404).json({
                error: 'Joueur non trouvé',
                message: `Aucun joueur trouvé avec l'ID ${id}`
            });
        }

        const player = result[0];

        // D'abord, récupérer la date la plus récente des classements pour le tour du joueur
        const latestDateQuery = `
            SELECT MAX(pr.ranking_date) as latest_date
            FROM player_rankings pr
                     JOIN players p ON pr.player_id = p.id
            WHERE p.tour = ?
        `;

        const latestDateResult = await sequelize.query(latestDateQuery, {
            replacements: [player.tour],
            type: sequelize.QueryTypes.SELECT
        });

        let currentRanking = null;

        if (latestDateResult[0]?.latest_date) {
            // Maintenant chercher le classement du joueur à cette date
            const rankingQuery = `
                SELECT
                    pr.position,
                    pr.points,
                    pr.ranking_date
                FROM player_rankings pr
                WHERE pr.player_id = ?
                  AND pr.ranking_date = ?
            `;

            const rankingResult = await sequelize.query(rankingQuery, {
                replacements: [id, latestDateResult[0].latest_date],
                type: sequelize.QueryTypes.SELECT
            });

            if (rankingResult.length > 0) {
                currentRanking = {
                    position: rankingResult[0].position,
                    points: rankingResult[0].points,
                    date: rankingResult[0].ranking_date
                };
            }
        }

        // Récupérer les statistiques de matchs
        const matchStatsQuery = `
            SELECT
                COUNT(*) as total_matches,
                COUNT(CASE WHEN winner_id = ? THEN 1 END) as total_wins,
                COUNT(CASE WHEN loser_id = ? THEN 1 END) as total_losses
            FROM matches
            WHERE winner_id = ? OR loser_id = ?
        `;

        const matchStatsResult = await sequelize.query(matchStatsQuery, {
            replacements: [id, id, id, id],
            type: sequelize.QueryTypes.SELECT
        });

        const matchStats = matchStatsResult[0];

        // Réponse avec les nouvelles informations
        res.json({
            id: player.id,
            full_name: player.full_name,
            first_name: player.first_name,
            last_name: player.last_name,
            country_code: player.country_code,
            tour: player.tour,
            current_ranking: currentRanking,
            latest_ranking_date: latestDateResult[0]?.latest_date || null,
            career_stats: {
                total_matches: parseInt(matchStats.total_matches) || 0,
                total_wins: parseInt(matchStats.total_wins) || 0,
                total_losses: parseInt(matchStats.total_losses) || 0
            }
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les informations du joueur'
        });
    }
});

/**
 * @swagger
 * /api/v1/players/{id}/matches:
 *   get:
 *     summary: Récupère la liste des matchs d'un joueur
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du joueur
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Nombre de matchs à retourner
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Décalage pour la pagination
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filtrer par année
 *     responses:
 *       200:
 *         description: Liste des matchs du joueurplayers.js et
 */
// Remplacer la route /:id/matches dans backend/src/routes/players.js par celle-ci :

router.get('/:id/matches', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            limit = 100, 
            offset = 0, 
            tournament, 
            type, 
            surface, 
            round, 
            opponent 
        } = req.query;

        const limitInt = Math.min(Math.max(parseInt(limit) || 100, 1), 200);
        const offsetInt = Math.max(parseInt(offset) || 0, 0);

        // Vérifier que le joueur existe
        const playerCheck = await sequelize.query('SELECT id, full_name, tour FROM players WHERE id = ?', {
            replacements: [id],
            type: sequelize.QueryTypes.SELECT
        });

        if (playerCheck.length === 0) {
            return res.status(404).json({
                error: 'Joueur non trouvé',
                message: `Aucun joueur trouvé avec l'ID ${id}`
            });
        }

        const player = playerCheck[0];

        // Construire les conditions de filtrage
        let whereConditions = ['(m.winner_id = ? OR m.loser_id = ?)'];
        let replacements = [id, id, id, id, id, id, id];
        
        // Filtrage par tournoi (nom du tournoi)
        if (tournament && tournament.trim()) {
            whereConditions.push('LOWER(t.name) LIKE LOWER(?)');
            replacements.push(`%${tournament.trim()}%`);
        }
        
        // Filtrage par type de tournoi
        if (type && type.trim()) {
            whereConditions.push('LOWER(tt.name) = LOWER(?)');
            replacements.push(type.trim());
        }
        
        // Filtrage par surface
        if (surface && surface.trim()) {
            whereConditions.push('LOWER(cs.name) = LOWER(?)');
            replacements.push(surface.trim());
        }
        
        // Filtrage par round
        if (round && round.trim()) {
            whereConditions.push('LOWER(r.name) LIKE LOWER(?)');
            replacements.push(`%${round.trim()}%`);
        }
        
        // Filtrage par adversaire
        if (opponent && opponent.trim()) {
            whereConditions.push('(LOWER(winner.full_name) LIKE LOWER(?) OR LOWER(loser.full_name) LIKE LOWER(?))');
            replacements.push(`%${opponent.trim()}%`, `%${opponent.trim()}%`);
        }

        // Requête pour récupérer les matchs du joueur avec les classements
        const matchesQuery = `
            SELECT 
                m.id,
                m.match_date,
                m.score_raw,
                m.winner_odds,
                m.loser_odds,
                m.is_walkover,
                m.winner_ranking,
                m.loser_ranking,
                -- Informations du tournoi
                t.name as tournament_name,
                tt.name as tournament_type,
                cs.name as surface_name,
                c.code as country_code,
                -- Informations du round
                r.name as round_name,
                r.is_qualifying,
                r.id as round_id,
                -- Informations des joueurs
                winner.full_name as winner_name,
                winner.id as winner_id,
                loser.full_name as loser_name,
                loser.id as loser_id,
                -- Déterminer si le joueur a gagné ou perdu
                CASE 
                    WHEN m.winner_id = ? THEN 'WON'
                    ELSE 'LOST'
                END as match_result,
                -- Cotes du joueur
                CASE 
                    WHEN m.winner_id = ? THEN m.winner_odds
                    ELSE m.loser_odds
                END as player_odds,
                -- Cotes de l'adversaire
                CASE 
                    WHEN m.winner_id = ? THEN m.loser_odds
                    ELSE m.winner_odds
                END as opponent_odds,
                -- Classement du joueur
                CASE 
                    WHEN m.winner_id = ? THEN m.winner_ranking
                    ELSE m.loser_ranking
                END as player_ranking,
                -- Classement de l'adversaire
                CASE 
                    WHEN m.winner_id = ? THEN m.loser_ranking
                    ELSE m.winner_ranking
                END as opponent_ranking
            FROM matches m
            JOIN players winner ON m.winner_id = winner.id
            JOIN players loser ON m.loser_id = loser.id
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
            LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
            LEFT JOIN countries c ON t.country_id = c.id
            LEFT JOIN rounds r ON m.round_id = r.id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY m.match_date DESC, m.id DESC
            LIMIT ? OFFSET ?
        `;

        replacements.push(limitInt, offsetInt);

        const matches = await sequelize.query(matchesQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Compter le total de matchs pour la pagination avec les mêmes filtres
        const countReplacements = [id, id];
        let countWhereConditions = ['(m.winner_id = ? OR m.loser_id = ?)'];
        
        // Reproduire les mêmes conditions de filtrage pour le count
        if (tournament && tournament.trim()) {
            countWhereConditions.push('LOWER(t.name) LIKE LOWER(?)');
            countReplacements.push(`%${tournament.trim()}%`);
        }
        
        if (type && type.trim()) {
            countWhereConditions.push('LOWER(tt.name) = LOWER(?)');
            countReplacements.push(type.trim());
        }
        
        if (surface && surface.trim()) {
            countWhereConditions.push('LOWER(cs.name) = LOWER(?)');
            countReplacements.push(surface.trim());
        }
        
        if (round && round.trim()) {
            countWhereConditions.push('LOWER(r.name) LIKE LOWER(?)');
            countReplacements.push(`%${round.trim()}%`);
        }
        
        if (opponent && opponent.trim()) {
            countWhereConditions.push('(LOWER(winner.full_name) LIKE LOWER(?) OR LOWER(loser.full_name) LIKE LOWER(?))');
            countReplacements.push(`%${opponent.trim()}%`, `%${opponent.trim()}%`);
        }

        const countQuery = `
            SELECT COUNT(*) as total
            FROM matches m
            JOIN players winner ON m.winner_id = winner.id
            JOIN players loser ON m.loser_id = loser.id
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
            LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
            LEFT JOIN countries c ON t.country_id = c.id
            LEFT JOIN rounds r ON m.round_id = r.id
            WHERE ${countWhereConditions.join(' AND ')}
        `;

        const countResult = await sequelize.query(countQuery, {
            replacements: countReplacements,
            type: sequelize.QueryTypes.SELECT
        });

        const totalMatches = parseInt(countResult[0].total);

        // Formater les résultats
        const formattedMatches = matches.map(match => ({
            id: match.id,
            date: match.match_date,
            tournament: {
                name: match.tournament_name,
                type: match.tournament_type,
                surface: match.surface_name,
                country: match.country_code
            },
            round: {
                name: match.round_name,
                is_qualifying: match.is_qualifying,
                round_id: match.round_id,
                is_qualification_match: match.round_id <= 4
            },
            result: {
                winner: {
                    id: match.winner_id,
                    name: match.winner_name,
                    ranking: match.winner_ranking
                },
                loser: {
                    id: match.loser_id,
                    name: match.loser_name,
                    ranking: match.loser_ranking
                },
                score: match.score_raw,
                is_walkover: match.is_walkover,
                player_result: match.match_result
            },
            odds: {
                player_odds: match.player_odds ? parseFloat(match.player_odds) : null,
                opponent_odds: match.opponent_odds ? parseFloat(match.opponent_odds) : null,
                winner_odds: match.winner_odds ? parseFloat(match.winner_odds) : null,
                loser_odds: match.loser_odds ? parseFloat(match.loser_odds) : null,
                available: !!(match.player_odds && match.opponent_odds)
            },
            rankings: {
                player_ranking: match.player_ranking,
                opponent_ranking: match.opponent_ranking
            }
        }));

        res.json({
            player: {
                id: player.id,
                name: player.full_name,
                tour: player.tour
            },
            matches: formattedMatches,
            pagination: {
                total: totalMatches,
                limit: limitInt,
                offset: offsetInt,
                has_more: (offsetInt + limitInt) < totalMatches
            }
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les matchs du joueur'
        });
    }
});

/**
 * @swagger
 * /api/v1/players/{id}/stats:
 *   get:
 *     summary: Récupère les statistiques détaillées d'un joueur par type et surface
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du joueur
 *     responses:
 *       200:
 *         description: Statistiques détaillées du joueur
 */
/**
 * @swagger
 * /api/v1/players/{id}/odds-stats:
 *   get:
 *     summary: Récupère les statistiques de performance par cotes d'un joueur
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du joueur
 *     responses:
 *       200:
 *         description: Statistiques de performance par cotes
 */
router.get('/:id/odds-stats', async (req, res) => {
    try {
        const { id } = req.params;

        // Vérifier que le joueur existe
        const playerCheck = await sequelize.query('SELECT id, full_name, tour FROM players WHERE id = ?', {
            replacements: [id],
            type: sequelize.QueryTypes.SELECT
        });

        if (playerCheck.length === 0) {
            return res.status(404).json({
                error: 'Joueur non trouvé',
                message: `Aucun joueur trouvé avec l'ID ${id}`
            });
        }

        const player = playerCheck[0];

        // Requête pour les statistiques par déciles de probabilité
        // Probabilité = 1 / cote (ex: cote 2.0 = 50% de probabilité)
        const oddsStatsByDecilesQuery = `
            WITH player_matches_with_odds AS (
                SELECT 
                    m.id,
                    m.match_date,
                    CASE 
                        WHEN m.winner_id = ? THEN 'WON'
                        ELSE 'LOST'
                    END as result,
                    CASE 
                        WHEN m.winner_id = ? THEN m.winner_odds
                        ELSE m.loser_odds
                    END as player_odds,
                    CASE 
                        WHEN m.winner_id = ? THEN m.winner_odds
                        ELSE m.loser_odds
                    END as odds_value
                FROM matches m
                WHERE (m.winner_id = ? OR m.loser_id = ?)
                  AND ((m.winner_id = ? AND m.winner_odds IS NOT NULL) 
                       OR (m.loser_id = ? AND m.loser_odds IS NOT NULL))
            ),
            odds_with_probability AS (
                SELECT 
                    *,
                    (100.0 / odds_value) as probability_percentage,
                    CASE 
                        WHEN (100.0 / odds_value) <= 10 THEN '0-10%'
                        WHEN (100.0 / odds_value) <= 20 THEN '10-20%'
                        WHEN (100.0 / odds_value) <= 30 THEN '20-30%'
                        WHEN (100.0 / odds_value) <= 40 THEN '30-40%'
                        WHEN (100.0 / odds_value) <= 50 THEN '40-50%'
                        WHEN (100.0 / odds_value) <= 60 THEN '50-60%'
                        WHEN (100.0 / odds_value) <= 70 THEN '60-70%'
                        WHEN (100.0 / odds_value) <= 80 THEN '70-80%'
                        WHEN (100.0 / odds_value) <= 90 THEN '80-90%'
                        ELSE '90-100%'
                    END as probability_decile
                FROM player_matches_with_odds
                WHERE odds_value > 0
            )
            SELECT 
                probability_decile,
                COUNT(*) as total_matches,
                COUNT(CASE WHEN result = 'WON' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'LOST' THEN 1 END) as losses,
                ROUND(COUNT(CASE WHEN result = 'WON' THEN 1 END) * 100.0 / COUNT(*), 1) as win_percentage,
                ROUND(AVG(probability_percentage), 1) as avg_expected_win_rate,
                ROUND(MIN(probability_percentage), 1) as min_probability,
                ROUND(MAX(probability_percentage), 1) as max_probability,
                ROUND(MIN(odds_value), 2) as min_odds,
                ROUND(MAX(odds_value), 2) as max_odds
            FROM odds_with_probability
            GROUP BY probability_decile
            ORDER BY 
                CASE probability_decile
                    WHEN '0-10%' THEN 1
                    WHEN '10-20%' THEN 2
                    WHEN '20-30%' THEN 3
                    WHEN '30-40%' THEN 4
                    WHEN '40-50%' THEN 5
                    WHEN '50-60%' THEN 6
                    WHEN '60-70%' THEN 7
                    WHEN '70-80%' THEN 8
                    WHEN '80-90%' THEN 9
                    WHEN '90-100%' THEN 10
                END
        `;

        const statsByDeciles = await sequelize.query(oddsStatsByDecilesQuery, {
            replacements: [id, id, id, id, id, id, id],
            type: sequelize.QueryTypes.SELECT
        });

        // Requête pour les tranches spécifiques de probabilité
        const oddsStatsBySpecificRangesQuery = `
            WITH player_matches_with_odds AS (
                SELECT 
                    m.id,
                    m.match_date,
                    CASE 
                        WHEN m.winner_id = ? THEN 'WON'
                        ELSE 'LOST'
                    END as result,
                    CASE 
                        WHEN m.winner_id = ? THEN m.winner_odds
                        ELSE m.loser_odds
                    END as player_odds,
                    CASE 
                        WHEN m.winner_id = ? THEN m.winner_odds
                        ELSE m.loser_odds
                    END as odds_value
                FROM matches m
                WHERE (m.winner_id = ? OR m.loser_id = ?)
                  AND ((m.winner_id = ? AND m.winner_odds IS NOT NULL) 
                       OR (m.loser_id = ? AND m.loser_odds IS NOT NULL))
            ),
            odds_with_probability AS (
                SELECT 
                    *,
                    (100.0 / odds_value) as probability_percentage,
                    CASE 
                        WHEN (100.0 / odds_value) < 35 THEN 'Moins de 35%'
                        WHEN (100.0 / odds_value) >= 35 AND (100.0 / odds_value) < 45 THEN '35-45%'
                        WHEN (100.0 / odds_value) >= 45 AND (100.0 / odds_value) < 55 THEN '45-55%'
                        WHEN (100.0 / odds_value) >= 55 AND (100.0 / odds_value) < 65 THEN '55-65%'
                        WHEN (100.0 / odds_value) >= 65 AND (100.0 / odds_value) < 75 THEN '65-75%'
                        WHEN (100.0 / odds_value) >= 75 THEN 'Plus de 75%'
                    END as probability_range
                FROM player_matches_with_odds
                WHERE odds_value > 0
            )
            SELECT 
                probability_range,
                COUNT(*) as total_matches,
                COUNT(CASE WHEN result = 'WON' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'LOST' THEN 1 END) as losses,
                ROUND(COUNT(CASE WHEN result = 'WON' THEN 1 END) * 100.0 / COUNT(*), 1) as win_percentage,
                ROUND(AVG(probability_percentage), 1) as avg_expected_win_rate,
                ROUND(MIN(probability_percentage), 1) as min_probability,
                ROUND(MAX(probability_percentage), 1) as max_probability,
                ROUND(MIN(odds_value), 2) as min_odds,
                ROUND(MAX(odds_value), 2) as max_odds,
                -- Calcul de l'efficacité (performance vs attendu)
                ROUND(
                    (COUNT(CASE WHEN result = 'WON' THEN 1 END) * 100.0 / COUNT(*)) - AVG(probability_percentage), 1
                ) as efficiency_diff
            FROM odds_with_probability
            WHERE probability_range IS NOT NULL
            GROUP BY probability_range
            ORDER BY 
                CASE probability_range
                    WHEN 'Moins de 35%' THEN 1
                    WHEN '35-45%' THEN 2
                    WHEN '45-55%' THEN 3
                    WHEN '55-65%' THEN 4
                    WHEN '65-75%' THEN 5
                    WHEN 'Plus de 75%' THEN 6
                END
        `;

        const statsBySpecificRanges = await sequelize.query(oddsStatsBySpecificRangesQuery, {
            replacements: [id, id, id, id, id, id, id],
            type: sequelize.QueryTypes.SELECT
        });

        // Statistiques globales sur les cotes
        const globalOddsStatsQuery = `
            WITH player_matches_with_odds AS (
                SELECT 
                    m.id,
                    CASE 
                        WHEN m.winner_id = ? THEN 'WON'
                        ELSE 'LOST'
                    END as result,
                    CASE 
                        WHEN m.winner_id = ? THEN m.winner_odds
                        ELSE m.loser_odds
                    END as odds_value
                FROM matches m
                WHERE (m.winner_id = ? OR m.loser_id = ?)
                  AND ((m.winner_id = ? AND m.winner_odds IS NOT NULL) 
                       OR (m.loser_id = ? AND m.loser_odds IS NOT NULL))
            )
            SELECT 
                COUNT(*) as total_matches_with_odds,
                COUNT(CASE WHEN result = 'WON' THEN 1 END) as total_wins,
                ROUND(COUNT(CASE WHEN result = 'WON' THEN 1 END) * 100.0 / COUNT(*), 1) as overall_win_rate,
                ROUND(AVG(100.0 / odds_value), 1) as avg_expected_win_rate,
                ROUND(MIN(odds_value), 2) as best_odds_taken,
                ROUND(MAX(odds_value), 2) as worst_odds_taken,
                ROUND(AVG(odds_value), 2) as avg_odds,
                -- Performance vs bookmaker expectations
                ROUND(
                    (COUNT(CASE WHEN result = 'WON' THEN 1 END) * 100.0 / COUNT(*)) - AVG(100.0 / odds_value), 1
                ) as outperformance
            FROM player_matches_with_odds
        `;

        const globalStats = await sequelize.query(globalOddsStatsQuery, {
            replacements: [id, id, id, id, id, id],
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            player: {
                id: player.id,
                name: player.full_name,
                tour: player.tour
            },
            odds_statistics: {
                global: globalStats[0] || {},
                by_deciles: statsByDeciles.map(stat => ({
                    probability_range: stat.probability_decile,
                    total_matches: parseInt(stat.total_matches),
                    wins: parseInt(stat.wins),
                    losses: parseInt(stat.losses),
                    win_percentage: parseFloat(stat.win_percentage),
                    expected_win_rate: parseFloat(stat.avg_expected_win_rate),
                    probability_range_details: {
                        min: parseFloat(stat.min_probability),
                        max: parseFloat(stat.max_probability)
                    },
                    odds_range: {
                        min: parseFloat(stat.min_odds),
                        max: parseFloat(stat.max_odds)
                    }
                })),
                by_specific_ranges: statsBySpecificRanges.map(stat => ({
                    probability_range: stat.probability_range,
                    total_matches: parseInt(stat.total_matches),
                    wins: parseInt(stat.wins),
                    losses: parseInt(stat.losses),
                    win_percentage: parseFloat(stat.win_percentage),
                    expected_win_rate: parseFloat(stat.avg_expected_win_rate),
                    efficiency_difference: parseFloat(stat.efficiency_diff),
                    probability_range_details: {
                        min: parseFloat(stat.min_probability),
                        max: parseFloat(stat.max_probability)
                    },
                    odds_range: {
                        min: parseFloat(stat.min_odds),
                        max: parseFloat(stat.max_odds)
                    }
                }))
            }
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les statistiques de cotes du joueur'
        });
    }
});

router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;

        // Vérifier que le joueur existe
        const playerCheck = await sequelize.query('SELECT id, full_name, tour FROM players WHERE id = ?', {
            replacements: [id],
            type: sequelize.QueryTypes.SELECT
        });

        if (playerCheck.length === 0) {
            return res.status(404).json({
                error: 'Joueur non trouvé',
                message: `Aucun joueur trouvé avec l'ID ${id}`
            });
        }

        // Statistiques par type de tournoi avec distinction qualification/tableau principal et périodes
        const statsByTypeQuery = `
            SELECT 
                COALESCE(tt.name, 'Non spécifié') as tournament_type,
                -- Stats totales
                COUNT(*) as total_matches,
                COUNT(CASE WHEN m.winner_id = ? THEN 1 END) as wins,
                COUNT(CASE WHEN m.loser_id = ? THEN 1 END) as losses,
                ROUND(
                    (COUNT(CASE WHEN m.winner_id = ? THEN 1 END) * 100.0 / COUNT(*)), 1
                ) as win_percentage,
                -- Stats 3 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as matches_3m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as wins_3m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_3m,
                -- Stats 6 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as matches_6m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as wins_6m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_6m,
                -- Stats 12 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as matches_12m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as wins_12m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_12m,
                -- Stats 24 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as matches_24m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as wins_24m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_24m,
                -- Stats tableau principal (round_id > 4)
                COUNT(CASE WHEN r.id > 4 THEN 1 END) as main_draw_matches,
                COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 THEN 1 END) as main_draw_wins,
                COUNT(CASE WHEN m.loser_id = ? AND r.id > 4 THEN 1 END) as main_draw_losses,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id > 4 THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id > 4 THEN 1 END))
                        ELSE 0
                    END, 1
                ) as main_draw_win_percentage,
                -- Stats qualifications (round_id <= 4)
                COUNT(CASE WHEN r.id <= 4 THEN 1 END) as qualifying_matches,
                COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 THEN 1 END) as qualifying_wins,
                COUNT(CASE WHEN m.loser_id = ? AND r.id <= 4 THEN 1 END) as qualifying_losses,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id <= 4 THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id <= 4 THEN 1 END))
                        ELSE 0
                    END, 1
                ) as qualifying_win_percentage,
                
                -- Stats tour principal par périodes
                -- 3 mois
                COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as main_draw_matches_3m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as main_draw_wins_3m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as main_draw_win_percentage_3m,
                -- 6 mois
                COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as main_draw_matches_6m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as main_draw_wins_6m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as main_draw_win_percentage_6m,
                -- 12 mois
                COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as main_draw_matches_12m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as main_draw_wins_12m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as main_draw_win_percentage_12m,
                -- 24 mois
                COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as main_draw_matches_24m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as main_draw_wins_24m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id > 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as main_draw_win_percentage_24m,
                
                -- Stats qualifications par périodes
                -- 3 mois
                COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as qualifying_matches_3m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as qualifying_wins_3m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as qualifying_win_percentage_3m,
                -- 6 mois
                COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as qualifying_matches_6m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as qualifying_wins_6m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as qualifying_win_percentage_6m,
                -- 12 mois
                COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as qualifying_matches_12m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as qualifying_wins_12m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as qualifying_win_percentage_12m,
                -- 24 mois
                COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as qualifying_matches_24m,
                COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as qualifying_wins_24m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN r.id <= 4 AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as qualifying_win_percentage_24m
            FROM matches m
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
            LEFT JOIN rounds r ON m.round_id = r.id
            WHERE (m.winner_id = ? OR m.loser_id = ?)
            GROUP BY tt.name
            ORDER BY total_matches DESC, tt.name
        `;

        const statsByType = await sequelize.query(statsByTypeQuery, {
            replacements: [
                id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, // 19 premiers paramètres originaux
                id, id, id, id, id, id, id, id, id, id, id, id, // 12 nouveaux paramètres pour main_draw par périodes
                id, id, id, id, id, id, id, id, id, id, id, id  // 12 nouveaux paramètres pour qualifying par périodes
            ],
            type: sequelize.QueryTypes.SELECT
        });

        // Statistiques par surface avec périodes temporelles
        const statsBySurfaceQuery = `
            SELECT 
                COALESCE(cs.name, 'Non spécifiée') as surface,
                -- Stats totales
                COUNT(*) as total_matches,
                COUNT(CASE WHEN m.winner_id = ? THEN 1 END) as wins,
                COUNT(CASE WHEN m.loser_id = ? THEN 1 END) as losses,
                ROUND(
                    (COUNT(CASE WHEN m.winner_id = ? THEN 1 END) * 100.0 / COUNT(*)), 1
                ) as win_percentage,
                -- Stats 3 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as matches_3m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as wins_3m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '3 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_3m,
                -- Stats 6 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as matches_6m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as wins_6m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_6m,
                -- Stats 12 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as matches_12m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) as wins_12m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '12 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_12m,
                -- Stats 24 mois
                COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as matches_24m,
                COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) as wins_24m,
                ROUND(
                    CASE 
                        WHEN COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) > 0 
                        THEN (COUNT(CASE WHEN m.winner_id = ? AND m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END) * 100.0 / COUNT(CASE WHEN m.match_date >= CURRENT_DATE - INTERVAL '24 months' THEN 1 END))
                        ELSE 0
                    END, 1
                ) as win_percentage_24m
            FROM matches m
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
            WHERE (m.winner_id = ? OR m.loser_id = ?)
            GROUP BY cs.name
            ORDER BY total_matches DESC, cs.name
        `;

        const statsBySurface = await sequelize.query(statsBySurfaceQuery, {
            replacements: [id, id, id, id, id, id, id, id, id, id, id, id, id],
            type: sequelize.QueryTypes.SELECT
        });

        // Pour chaque surface, obtenir la meilleure victoire et la pire défaite pour chaque période
        const enhancedStatsBySurface = [];
        for (const surfaceStat of statsBySurface) {
            const periods = ['total', '3m', '6m', '12m', '24m'];
            const periodConditions = {
                'total': '',
                '3m': 'AND m.match_date >= CURRENT_DATE - INTERVAL \'3 months\'',
                '6m': 'AND m.match_date >= CURRENT_DATE - INTERVAL \'6 months\'',
                '12m': 'AND m.match_date >= CURRENT_DATE - INTERVAL \'12 months\'',
                '24m': 'AND m.match_date >= CURRENT_DATE - INTERVAL \'24 months\''
            };

            const periodStats = {};

            for (const period of periods) {
                // Meilleure victoire pour cette période
                const bestWinQuery = `
                    SELECT 
                        loser.full_name as opponent_name,
                        m.loser_ranking as opponent_ranking
                    FROM matches m
                    JOIN tournaments t ON m.tournament_id = t.id
                    LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
                    JOIN players loser ON m.loser_id = loser.id
                    WHERE m.winner_id = ? 
                      AND COALESCE(cs.name, 'Non spécifiée') = ?
                      AND m.loser_ranking IS NOT NULL
                      ${periodConditions[period]}
                    ORDER BY m.loser_ranking ASC
                    LIMIT 1
                `;

                const bestWinResult = await sequelize.query(bestWinQuery, {
                    replacements: [id, surfaceStat.surface],
                    type: sequelize.QueryTypes.SELECT
                });

                // Pire défaite pour cette période
                const worstLossQuery = `
                    SELECT 
                        winner.full_name as opponent_name,
                        m.winner_ranking as opponent_ranking
                    FROM matches m
                    JOIN tournaments t ON m.tournament_id = t.id
                    LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
                    JOIN players winner ON m.winner_id = winner.id
                    WHERE m.loser_id = ? 
                      AND COALESCE(cs.name, 'Non spécifiée') = ?
                      AND m.winner_ranking IS NOT NULL
                      ${periodConditions[period]}
                    ORDER BY m.winner_ranking DESC
                    LIMIT 1
                `;

                const worstLossResult = await sequelize.query(worstLossQuery, {
                    replacements: [id, surfaceStat.surface],
                    type: sequelize.QueryTypes.SELECT
                });

                periodStats[period] = {
                    best_win: bestWinResult.length > 0 ? {
                        opponent_name: bestWinResult[0].opponent_name,
                        opponent_ranking: bestWinResult[0].opponent_ranking
                    } : null,
                    worst_loss: worstLossResult.length > 0 ? {
                        opponent_name: worstLossResult[0].opponent_name,
                        opponent_ranking: worstLossResult[0].opponent_ranking
                    } : null
                };
            }

            enhancedStatsBySurface.push({
                ...surfaceStat,
                period_details: periodStats
            });
        }


        const player = playerCheck[0];

        res.json({
            player: {
                id: player.id,
                name: player.full_name,
                tour: player.tour
            },
            statistics: {
                by_tournament_type: statsByType.map(stat => ({
                    tournament_type: stat.tournament_type,
                    total: {
                        matches: parseInt(stat.total_matches),
                        wins: parseInt(stat.wins),
                        losses: parseInt(stat.losses),
                        win_percentage: parseFloat(stat.win_percentage)
                    },
                    periods: {
                        '3m': {
                            matches: parseInt(stat.matches_3m),
                            wins: parseInt(stat.wins_3m),
                            win_percentage: parseFloat(stat.win_percentage_3m)
                        },
                        '6m': {
                            matches: parseInt(stat.matches_6m),
                            wins: parseInt(stat.wins_6m),
                            win_percentage: parseFloat(stat.win_percentage_6m)
                        },
                        '12m': {
                            matches: parseInt(stat.matches_12m),
                            wins: parseInt(stat.wins_12m),
                            win_percentage: parseFloat(stat.win_percentage_12m)
                        },
                        '24m': {
                            matches: parseInt(stat.matches_24m),
                            wins: parseInt(stat.wins_24m),
                            win_percentage: parseFloat(stat.win_percentage_24m)
                        }
                    },
                    main_draw: {
                        matches: parseInt(stat.main_draw_matches),
                        wins: parseInt(stat.main_draw_wins),
                        losses: parseInt(stat.main_draw_losses),
                        win_percentage: parseFloat(stat.main_draw_win_percentage),
                        periods: {
                            '3m': {
                                matches: parseInt(stat.main_draw_matches_3m),
                                wins: parseInt(stat.main_draw_wins_3m),
                                win_percentage: parseFloat(stat.main_draw_win_percentage_3m)
                            },
                            '6m': {
                                matches: parseInt(stat.main_draw_matches_6m),
                                wins: parseInt(stat.main_draw_wins_6m),
                                win_percentage: parseFloat(stat.main_draw_win_percentage_6m)
                            },
                            '12m': {
                                matches: parseInt(stat.main_draw_matches_12m),
                                wins: parseInt(stat.main_draw_wins_12m),
                                win_percentage: parseFloat(stat.main_draw_win_percentage_12m)
                            },
                            '24m': {
                                matches: parseInt(stat.main_draw_matches_24m),
                                wins: parseInt(stat.main_draw_wins_24m),
                                win_percentage: parseFloat(stat.main_draw_win_percentage_24m)
                            }
                        }
                    },
                    qualifying: {
                        matches: parseInt(stat.qualifying_matches),
                        wins: parseInt(stat.qualifying_wins),
                        losses: parseInt(stat.qualifying_losses),
                        win_percentage: parseFloat(stat.qualifying_win_percentage),
                        periods: {
                            '3m': {
                                matches: parseInt(stat.qualifying_matches_3m),
                                wins: parseInt(stat.qualifying_wins_3m),
                                win_percentage: parseFloat(stat.qualifying_win_percentage_3m)
                            },
                            '6m': {
                                matches: parseInt(stat.qualifying_matches_6m),
                                wins: parseInt(stat.qualifying_wins_6m),
                                win_percentage: parseFloat(stat.qualifying_win_percentage_6m)
                            },
                            '12m': {
                                matches: parseInt(stat.qualifying_matches_12m),
                                wins: parseInt(stat.qualifying_wins_12m),
                                win_percentage: parseFloat(stat.qualifying_win_percentage_12m)
                            },
                            '24m': {
                                matches: parseInt(stat.qualifying_matches_24m),
                                wins: parseInt(stat.qualifying_wins_24m),
                                win_percentage: parseFloat(stat.qualifying_win_percentage_24m)
                            }
                        }
                    }
                })),
                by_surface: enhancedStatsBySurface.map(stat => ({
                    surface: stat.surface,
                    total: {
                        matches: parseInt(stat.total_matches),
                        wins: parseInt(stat.wins),
                        losses: parseInt(stat.losses),
                        win_percentage: parseFloat(stat.win_percentage),
                        best_win: stat.period_details.total.best_win,
                        worst_loss: stat.period_details.total.worst_loss
                    },
                    periods: {
                        '3m': {
                            matches: parseInt(stat.matches_3m),
                            wins: parseInt(stat.wins_3m),
                            win_percentage: parseFloat(stat.win_percentage_3m),
                            best_win: stat.period_details['3m'].best_win,
                            worst_loss: stat.period_details['3m'].worst_loss
                        },
                        '6m': {
                            matches: parseInt(stat.matches_6m),
                            wins: parseInt(stat.wins_6m),
                            win_percentage: parseFloat(stat.win_percentage_6m),
                            best_win: stat.period_details['6m'].best_win,
                            worst_loss: stat.period_details['6m'].worst_loss
                        },
                        '12m': {
                            matches: parseInt(stat.matches_12m),
                            wins: parseInt(stat.wins_12m),
                            win_percentage: parseFloat(stat.win_percentage_12m),
                            best_win: stat.period_details['12m'].best_win,
                            worst_loss: stat.period_details['12m'].worst_loss
                        },
                        '24m': {
                            matches: parseInt(stat.matches_24m),
                            wins: parseInt(stat.wins_24m),
                            win_percentage: parseFloat(stat.win_percentage_24m),
                            best_win: stat.period_details['24m'].best_win,
                            worst_loss: stat.period_details['24m'].worst_loss
                        }
                    }
                }))
            }
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les statistiques du joueur'
        });
    }
});

module.exports = router;