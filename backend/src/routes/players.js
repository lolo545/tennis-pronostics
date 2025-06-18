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
        const { limit = 100, offset = 0 } = req.query;

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
            WHERE (m.winner_id = ? OR m.loser_id = ?)
            ORDER BY m.match_date DESC, m.id DESC
            LIMIT ? OFFSET ?
        `;

        const replacements = [id, id, id, id, id, id, id, limitInt, offsetInt];

        const matches = await sequelize.query(matchesQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Compter le total de matchs pour la pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM matches m
            WHERE (m.winner_id = ? OR m.loser_id = ?)
        `;

        const countResult = await sequelize.query(countQuery, {
            replacements: [id, id],
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
                is_qualifying: match.is_qualifying
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

module.exports = router;