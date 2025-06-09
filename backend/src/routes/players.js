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

        // Réponse avec les nouvelles informations
        res.json({
            id: player.id,
            full_name: player.full_name,
            first_name: player.first_name,
            last_name: player.last_name,
            country_code: player.country_code,
            tour: player.tour,
            current_ranking: currentRanking,
            latest_ranking_date: latestDateResult[0]?.latest_date || null
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

// Supprimer les routes non nécessaires pour l'instant

module.exports = router;