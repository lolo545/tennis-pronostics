// =============================================
// ROUTES API - CLASSEMENTS JOUEURS (VERSION PRODUCTION)
// =============================================

const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     PlayerRanking:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID unique du classement
 *         player_id:
 *           type: integer
 *           description: ID du joueur
 *         ranking_date:
 *           type: string
 *           format: date
 *           description: Date du classement
 *         position:
 *           type: integer
 *           description: Position dans le classement
 *         points:
 *           type: integer
 *           description: Points ATP/WTA
 *         player:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             full_name:
 *               type: string
 *             tour:
 *               type: string
 *               enum: [ATP, WTA]
 *             country:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *         progression:
 *           type: integer
 *           description: Progression par rapport à la semaine précédente (+/-)
 *           nullable: true
 */

/**
 * @swagger
 * /api/v1/rankings/current:
 *   get:
 *     summary: Récupère le classement actuel
 *     tags: [Rankings]
 *     parameters:
 *       - in: query
 *         name: tour
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ATP, WTA]
 *         description: Tour (ATP ou WTA)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 100
 *         description: Nombre de joueurs à retourner
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filtrer par pays (code ISO 3 lettres)
 *     responses:
 *       200:
 *         description: Classement actuel avec progressions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rankings:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PlayerRanking'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     tour:
 *                       type: string
 *                     ranking_date:
 *                       type: string
 *                       format: date
 *                     total_players:
 *                       type: integer
 *                     limit:
 *                       type: integer
 */
router.get('/current', async (req, res) => {
    try {
        const { tour, limit = 100, country } = req.query;

        // Validation
        if (!tour || !['ATP', 'WTA'].includes(tour)) {
            return res.status(400).json({
                error: 'Tour requis',
                message: 'Le paramètre tour doit être ATP ou WTA'
            });
        }

        const limitInt = Math.min(Math.max(parseInt(limit) || 100, 1), 500);

        // Récupérer la date du dernier classement
        const latestDateQuery = `
            SELECT MAX(pr.ranking_date) as latest_date
            FROM player_rankings pr
            JOIN players p ON pr.player_id = p.id
            WHERE p.tour = ?
        `;

        const latestDateResult = await sequelize.query(latestDateQuery, {
            replacements: [tour],
            type: sequelize.QueryTypes.SELECT
        });

        if (!latestDateResult[0]?.latest_date) {
            return res.status(404).json({
                error: 'Aucun classement trouvé',
                message: `Aucun classement ${tour} disponible`
            });
        }

        const latestDate = latestDateResult[0].latest_date;

        // Récupérer la date de la semaine précédente pour les progressions
        const previousWeekQuery = `
            SELECT MAX(pr.ranking_date) as previous_date
            FROM player_rankings pr
            JOIN players p ON pr.player_id = p.id
            WHERE p.tour = ? AND pr.ranking_date < ?
        `;

        const previousWeekResult = await sequelize.query(previousWeekQuery, {
            replacements: [tour, latestDate],
            type: sequelize.QueryTypes.SELECT
        });

        const previousDate = previousWeekResult[0]?.previous_date;

        // Construire la requête principale
        let whereClause = '';
        let replacements = [tour, latestDate, limitInt];

        if (country) {
            whereClause = 'AND c.code = ?';
            replacements = [tour, latestDate, country.toUpperCase(), limitInt];
        }

        const rankingsQuery = `
            SELECT 
                pr.id,
                pr.player_id,
                pr.ranking_date,
                pr.position,
                pr.points,
                p.full_name,
                p.first_name,
                p.last_name,
                p.tour,
                p.atp_id,
                p.wta_id,
                c.code as country_code,
                CASE 
                    WHEN prev_pr.position IS NOT NULL THEN (prev_pr.position - pr.position)
                    ELSE NULL
                END as progression,
                -- Récupération des ratings ELO les plus récents
                latest_elo.winner_elo as current_elo,
                latest_elo.winner_elo_clay as current_elo_clay,
                latest_elo.winner_elo_grass as current_elo_grass,
                latest_elo.winner_elo_hard as current_elo_hard,
                latest_elo.winner_elo_ihard as current_elo_ihard
            FROM player_rankings pr
            JOIN players p ON pr.player_id = p.id
            LEFT JOIN countries c ON p.country_id = c.id
            LEFT JOIN player_rankings prev_pr ON (
                prev_pr.player_id = pr.player_id 
                AND prev_pr.ranking_date = ?
            )
            LEFT JOIN (
                WITH all_player_elos AS (
                    SELECT 
                        m.winner_id as player_id,
                        m.match_date,
                        m.winner_elo as elo,
                        m.winner_elo_clay as elo_clay,
                        m.winner_elo_grass as elo_grass,
                        m.winner_elo_hard as elo_hard,
                        m.winner_elo_ihard as elo_ihard
                    FROM matches m
                    WHERE m.winner_elo IS NOT NULL
                    UNION ALL
                    SELECT 
                        m.loser_id as player_id,
                        m.match_date,
                        m.loser_elo as elo,
                        m.loser_elo_clay as elo_clay,
                        m.loser_elo_grass as elo_grass,
                        m.loser_elo_hard as elo_hard,
                        m.loser_elo_ihard as elo_ihard
                    FROM matches m
                    WHERE m.loser_elo IS NOT NULL
                )
                SELECT 
                    player_id,
                    elo as winner_elo,
                    elo_clay as winner_elo_clay,
                    elo_grass as winner_elo_grass,
                    elo_hard as winner_elo_hard,
                    elo_ihard as winner_elo_ihard,
                    ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY match_date DESC) as rn
                FROM all_player_elos
            ) latest_elo ON latest_elo.player_id = pr.player_id AND latest_elo.rn = 1
            WHERE p.tour = ? 
            AND pr.ranking_date = ?
            ${whereClause}
            ORDER BY pr.position ASC
            LIMIT ?
        `;

        const finalReplacements = previousDate ?
            [previousDate, ...replacements] :
            [null, ...replacements];

        const rankings = await sequelize.query(rankingsQuery, {
            replacements: finalReplacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Compter le total
        const countQuery = `
            SELECT COUNT(*) as total
            FROM player_rankings pr
            JOIN players p ON pr.player_id = p.id
            LEFT JOIN countries c ON p.country_id = c.id
            WHERE p.tour = ? 
            AND pr.ranking_date = ?
            ${whereClause}
        `;

        const countReplacements = country ?
            [tour, latestDate, country.toUpperCase()] :
            [tour, latestDate];

        const countResult = await sequelize.query(countQuery, {
            replacements: countReplacements,
            type: sequelize.QueryTypes.SELECT
        });

        const totalPlayers = parseInt(countResult[0].total);

        // Formater les résultats
        const formattedRankings = rankings.map(ranking => ({
            id: ranking.id,
            player_id: ranking.player_id,
            ranking_date: ranking.ranking_date,
            position: ranking.position,
            points: ranking.points,
            progression: ranking.progression,
            elo_ratings: {
                general: ranking.current_elo,
                clay: ranking.current_elo_clay,
                grass: ranking.current_elo_grass,
                hard: ranking.current_elo_hard,
                indoor_hard: ranking.current_elo_ihard
            },
            player: {
                id: ranking.player_id,
                full_name: ranking.full_name,
                first_name: ranking.first_name,
                last_name: ranking.last_name,
                tour: ranking.tour,
                atp_id: ranking.atp_id,
                wta_id: ranking.wta_id,
                country: {
                    code: ranking.country_code
                }
            }
        }));

        res.json({
            rankings: formattedRankings,
            metadata: {
                tour,
                ranking_date: latestDate,
                previous_ranking_date: previousDate,
                total_players: totalPlayers,
                limit: limitInt,
                country_filter: country || null
            }
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer le classement'
        });
    }
});

/**
 * @swagger
 * /api/v1/rankings/historical:
 *   get:
 *     summary: Récupère les dates de classement disponibles
 *     tags: [Rankings]
 *     parameters:
 *       - in: query
 *         name: tour
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ATP, WTA]
 *         description: Tour (ATP ou WTA)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 2000
 *         description: Filtrer par année
 *     responses:
 *       200:
 *         description: Liste des dates de classement disponibles
 */
router.get('/historical', async (req, res) => {
    try {
        const { tour, year } = req.query;

        if (!tour || !['ATP', 'WTA'].includes(tour)) {
            return res.status(400).json({
                error: 'Tour requis',
                message: 'Le paramètre tour doit être ATP ou WTA'
            });
        }

        let whereClause = '';
        let replacements = [tour];

        if (year) {
            const yearInt = parseInt(year);
            if (yearInt >= 2000 && yearInt <= new Date().getFullYear()) {
                whereClause = 'AND EXTRACT(YEAR FROM pr.ranking_date) = ?';
                replacements.push(yearInt);
            }
        }

        const query = `
            SELECT DISTINCT 
                pr.ranking_date,
                COUNT(*) as players_count,
                MIN(pr.position) as min_position,
                MAX(pr.position) as max_position
            FROM player_rankings pr
            JOIN players p ON pr.player_id = p.id
            WHERE p.tour = ?
            ${whereClause}
            GROUP BY pr.ranking_date
            ORDER BY pr.ranking_date DESC
            LIMIT 100
        `;

        const dates = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            dates: dates.map(d => ({
                date: d.ranking_date,
                players_count: parseInt(d.players_count),
                position_range: {
                    min: d.min_position,
                    max: d.max_position
                }
            })),
            metadata: {
                tour,
                year_filter: year ? parseInt(year) : null,
                total_dates: dates.length
            }
        });

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les dates historiques'
        });
    }
});

/**
 * @swagger
 * /api/v1/rankings/by-date:
 *   get:
 *     summary: Récupère un classement à une date donnée
 *     tags: [Rankings]
 *     parameters:
 *       - in: query
 *         name: tour
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ATP, WTA]
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date du classement (YYYY-MM-DD)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Classement à la date demandée
 */
router.get('/by-date', async (req, res) => {
    try {
        const { tour, date, limit = 100 } = req.query;

        if (!tour || !['ATP', 'WTA'].includes(tour)) {
            return res.status(400).json({
                error: 'Tour requis',
                message: 'Le paramètre tour doit être ATP ou WTA'
            });
        }

        if (!date) {
            return res.status(400).json({
                error: 'Date requise',
                message: 'Le paramètre date est requis (format YYYY-MM-DD)'
            });
        }

        const limitInt = Math.min(Math.max(parseInt(limit) || 100, 1), 500);

        const query = `
            SELECT 
                pr.id,
                pr.player_id,
                pr.ranking_date,
                pr.position,
                pr.points,
                p.full_name,
                p.first_name,
                p.last_name,
                p.tour,
                c.code as country_code
            FROM player_rankings pr
            JOIN players p ON pr.player_id = p.id
            LEFT JOIN countries c ON p.country_id = c.id
            WHERE p.tour = ? 
            AND pr.ranking_date = ?
            ORDER BY pr.position ASC
            LIMIT ?
        `;

        const rankings = await sequelize.query(query, {
            replacements: [tour, date, limitInt],
            type: sequelize.QueryTypes.SELECT
        });

        if (rankings.length === 0) {
            return res.status(404).json({
                error: 'Classement non trouvé',
                message: `Aucun classement ${tour} trouvé pour la date ${date}`
            });
        }

        const formattedRankings = rankings.map(ranking => ({
            id: ranking.id,
            player_id: ranking.player_id,
            ranking_date: ranking.ranking_date,
            position: ranking.position,
            points: ranking.points,
            player: {
                id: ranking.player_id,
                full_name: ranking.full_name,
                first_name: ranking.first_name,
                last_name: ranking.last_name,
                tour: ranking.tour,
                country: {
                    code: ranking.country_code
                }
            }
        }));

        res.json({
            rankings: formattedRankings,
            metadata: {
                tour,
                ranking_date: date,
                total_returned: rankings.length,
                limit: limitInt
            }
        });

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer le classement'
        });
    }
});

/**
 * @swagger
 * /api/v1/rankings/player/{playerId}/history:
 *   get:
 *     summary: Récupère l'historique de classement d'un joueur
 *     tags: [Rankings]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du joueur
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 52
 *         description: Nombre de classements à retourner (défaut 1 an)
 *     responses:
 *       200:
 *         description: Historique du classement du joueur
 */
router.get('/player/:playerId/history', async (req, res) => {
    try {
        const { playerId } = req.params;
        const { limit = 52 } = req.query;

        const limitInt = Math.min(Math.max(parseInt(limit) || 52, 1), 200);

        const query = `
            SELECT 
                pr.id,
                pr.ranking_date,
                pr.position,
                pr.points,
                p.full_name,
                p.tour,
                LAG(pr.position) OVER (ORDER BY pr.ranking_date) as previous_position
            FROM player_rankings pr
            JOIN players p ON pr.player_id = p.id
            WHERE pr.player_id = ?
            ORDER BY pr.ranking_date DESC
            LIMIT ?
        `;

        const history = await sequelize.query(query, {
            replacements: [playerId, limitInt],
            type: sequelize.QueryTypes.SELECT
        });

        if (history.length === 0) {
            return res.status(404).json({
                error: 'Joueur non trouvé',
                message: 'Aucun historique de classement trouvé pour ce joueur'
            });
        }

        const formattedHistory = history.map(entry => ({
            id: entry.id,
            ranking_date: entry.ranking_date,
            position: entry.position,
            points: entry.points,
            progression: entry.previous_position ?
                (entry.previous_position - entry.position) : null
        }));

        res.json({
            history: formattedHistory,
            metadata: {
                player: {
                    id: parseInt(playerId),
                    full_name: history[0].full_name,
                    tour: history[0].tour
                },
                total_entries: history.length,
                date_range: {
                    from: history[history.length - 1].ranking_date,
                    to: history[0].ranking_date
                }
            }
        });

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer l\'historique du joueur'
        });
    }
});

/**
 * Route de test pour vérifier le bon fonctionnement
 */
router.get('/test', async (req, res) => {
    try {
        const result = await sequelize.query('SELECT NOW() as current_time, version() as db_version', {
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            status: 'OK',
            message: 'API Rankings opérationnelle',
            database_time: result[0].current_time,
            endpoints: [
                'GET /current?tour=ATP&limit=50',
                'GET /historical?tour=WTA',
                'GET /by-date?tour=ATP&date=2024-06-01',
                'GET /player/:id/history'
            ]
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: 'Erreur de connexion base de données',
            error: error.message
        });
    }
});

module.exports = router;