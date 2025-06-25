// =============================================
// ROUTES API - TOURNOIS
// =============================================

const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     Tournament:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         tour:
 *           type: string
 *           enum: [ATP, WTA]
 *         start_date:
 *           type: string
 *           format: date
 *         type:
 *           type: string
 *         surface:
 *           type: string
 *         country:
 *           type: string
 */

/**
 * @swagger
 * /api/v1/tournaments/search:
 *   get:
 *     summary: Recherche de tournois par nom et année
 *     tags: [Tournaments]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Nom du tournoi (recherche partielle)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Année du tournoi
 *       - in: query
 *         name: tour
 *         schema:
 *           type: string
 *           enum: [ATP, WTA]
 *         description: Circuit (ATP ou WTA)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Nombre de tournois à retourner
 *     responses:
 *       200:
 *         description: Liste des tournois trouvés
 */
router.get('/search', async (req, res) => {
    try {
        const { name, year, tour, limit = 50 } = req.query;
        
        const limitInt = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
        
        let whereConditions = [];
        let replacements = [];
        
        // Filtrage par nom (recherche partielle)
        if (name && name.trim()) {
            whereConditions.push('LOWER(t.name) LIKE LOWER(?)');
            replacements.push(`%${name.trim()}%`);
        }
        
        // Filtrage par année
        if (year && !isNaN(year)) {
            whereConditions.push('EXTRACT(YEAR FROM t.start_date) = ?');
            replacements.push(parseInt(year));
        }
        
        // Filtrage par circuit
        if (tour && (tour === 'ATP' || tour === 'WTA')) {
            whereConditions.push('t.tour = ?');
            replacements.push(tour);
        }
        
        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';
        
        const query = `
            SELECT 
                t.id,
                t.name,
                t.tour,
                t.start_date,
                tt.name as tournament_type,
                cs.name as surface_name,
                c.code as country_code,
                -- Compter les matchs du tournoi
                (
                    SELECT COUNT(*) 
                    FROM matches m 
                    WHERE m.tournament_id = t.id
                ) as match_count
            FROM tournaments t
            LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
            LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
            LEFT JOIN countries c ON t.country_id = c.id
            ${whereClause}
            ORDER BY t.start_date DESC, t.name
            LIMIT ?
        `;
        
        replacements.push(limitInt);
        
        const tournaments = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });
        
        const formattedTournaments = tournaments.map(tournament => ({
            id: tournament.id,
            name: tournament.name,
            tour: tournament.tour,
            start_date: tournament.start_date,
            year: tournament.start_date ? new Date(tournament.start_date).getFullYear() : null,
            type: tournament.tournament_type,
            surface: tournament.surface_name,
            country: tournament.country_code,
            match_count: parseInt(tournament.match_count) || 0
        }));
        
        res.json({
            tournaments: formattedTournaments,
            total_found: tournaments.length
        });
        
        logger.tennis.apiRequest('GET', req.path);
        
    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de rechercher les tournois'
        });
    }
});

/**
 * @swagger
 * /api/v1/tournaments/{id}:
 *   get:
 *     summary: Récupère les informations d'un tournoi par ID
 *     tags: [Tournaments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du tournoi
 *     responses:
 *       200:
 *         description: Informations du tournoi
 *       404:
 *         description: Tournoi non trouvé
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                t.id,
                t.name,
                t.tour,
                t.start_date,
                tt.name as tournament_type,
                cs.name as surface_name,
                c.code as country_code,
                -- Statistiques du tournoi
                (
                    SELECT COUNT(*) 
                    FROM matches m 
                    WHERE m.tournament_id = t.id
                ) as total_matches,
                (
                    SELECT COUNT(DISTINCT m.winner_id) + COUNT(DISTINCT m.loser_id)
                    FROM matches m 
                    WHERE m.tournament_id = t.id
                ) as total_players,
                (
                    SELECT MIN(m.match_date)
                    FROM matches m 
                    WHERE m.tournament_id = t.id
                ) as first_match_date,
                (
                    SELECT MAX(m.match_date)
                    FROM matches m 
                    WHERE m.tournament_id = t.id
                ) as last_match_date
            FROM tournaments t
            LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
            LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
            LEFT JOIN countries c ON t.country_id = c.id
            WHERE t.id = ?
        `;
        
        const result = await sequelize.query(query, {
            replacements: [id],
            type: sequelize.QueryTypes.SELECT
        });
        
        if (result.length === 0) {
            return res.status(404).json({
                error: 'Tournoi non trouvé',
                message: `Aucun tournoi trouvé avec l'ID ${id}`
            });
        }
        
        const tournament = result[0];
        
        res.json({
            id: tournament.id,
            name: tournament.name,
            tour: tournament.tour,
            start_date: tournament.start_date,
            year: tournament.start_date ? new Date(tournament.start_date).getFullYear() : null,
            type: tournament.tournament_type,
            surface: tournament.surface_name,
            country: tournament.country_code,
            statistics: {
                total_matches: parseInt(tournament.total_matches) || 0,
                total_players: parseInt(tournament.total_players) || 0,
                first_match_date: tournament.first_match_date,
                last_match_date: tournament.last_match_date
            }
        });
        
        logger.tennis.apiRequest('GET', req.path);
        
    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les informations du tournoi'
        });
    }
});

/**
 * @swagger
 * /api/v1/tournaments/{id}/matches:
 *   get:
 *     summary: Récupère la liste des matchs d'un tournoi
 *     tags: [Tournaments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du tournoi
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Nombre de matchs à retourner
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Décalage pour la pagination
 *       - in: query
 *         name: round
 *         schema:
 *           type: string
 *         description: Filtrer par tour (ex: Final, SF, QF)
 *       - in: query
 *         name: player
 *         schema:
 *           type: string
 *         description: Filtrer par nom de joueur
 *     responses:
 *       200:
 *         description: Liste des matchs du tournoi
 */
router.get('/:id/matches', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            limit = 100, 
            offset = 0, 
            round, 
            player 
        } = req.query;
        
        const limitInt = Math.min(Math.max(parseInt(limit) || 100, 1), 200);
        const offsetInt = Math.max(parseInt(offset) || 0, 0);
        
        // Vérifier que le tournoi existe
        const tournamentCheck = await sequelize.query('SELECT id, name, tour FROM tournaments WHERE id = ?', {
            replacements: [id],
            type: sequelize.QueryTypes.SELECT
        });
        
        if (tournamentCheck.length === 0) {
            return res.status(404).json({
                error: 'Tournoi non trouvé',
                message: `Aucun tournoi trouvé avec l'ID ${id}`
            });
        }
        
        const tournament = tournamentCheck[0];
        
        // Construire les conditions de filtrage
        let whereConditions = ['m.tournament_id = ?'];
        let replacements = [id];
        
        // Filtrage par tour
        if (round && round.trim()) {
            whereConditions.push('LOWER(r.name) LIKE LOWER(?)');
            replacements.push(`%${round.trim()}%`);
        }
        
        // Filtrage par joueur
        if (player && player.trim()) {
            whereConditions.push('(LOWER(winner.full_name) LIKE LOWER(?) OR LOWER(loser.full_name) LIKE LOWER(?))');
            replacements.push(`%${player.trim()}%`, `%${player.trim()}%`);
        }
        
        // Requête pour récupérer les matchs du tournoi
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
                r.display_order,
                -- Informations des joueurs
                winner.full_name as winner_name,
                winner.id as winner_id,
                loser.full_name as loser_name,
                loser.id as loser_id
            FROM matches m
            JOIN players winner ON m.winner_id = winner.id
            JOIN players loser ON m.loser_id = loser.id
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
            LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
            LEFT JOIN countries c ON t.country_id = c.id
            LEFT JOIN rounds r ON m.round_id = r.id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY 
                COALESCE(r.display_order, 99) DESC,
                m.match_date DESC, 
                m.id ASC
            LIMIT ? OFFSET ?
        `;
        
        replacements.push(limitInt, offsetInt);
        
        const matches = await sequelize.query(matchesQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });
        
        // Compter le total de matchs pour la pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM matches m
            JOIN players winner ON m.winner_id = winner.id
            JOIN players loser ON m.loser_id = loser.id
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN rounds r ON m.round_id = r.id
            WHERE ${whereConditions.join(' AND ')}
        `;
        
        const countReplacements = replacements.slice(0, -2); // Remove limit and offset
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
                id: id,
                name: match.tournament_name,
                type: match.tournament_type,
                surface: match.surface_name,
                country: match.country_code
            },
            round: {
                name: match.round_name,
                is_qualifying: match.is_qualifying,
                display_order: match.display_order
            },
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
            result: {
                score: match.score_raw,
                is_walkover: match.is_walkover
            },
            odds: {
                winner_odds: match.winner_odds ? parseFloat(match.winner_odds) : null,
                loser_odds: match.loser_odds ? parseFloat(match.loser_odds) : null,
                available: !!(match.winner_odds && match.loser_odds)
            }
        }));
        
        res.json({
            tournament: {
                id: tournament.id,
                name: tournament.name,
                tour: tournament.tour
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
            message: 'Impossible de récupérer les matchs du tournoi'
        });
    }
});

module.exports = router;