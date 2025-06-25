// =============================================
// ROUTES API - SYNCHRONISATION
// =============================================

const express = require('express');
const router = express.Router();
const syncMonitoring = require('../services/syncMonitoring');
const { performSync } = require('../../migrations/incremental-sync');
const logger = require('../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     SyncStatus:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [running, completed, failed]
 *         progress:
 *           type: object
 *         message:
 *           type: string
 *     SyncHistory:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         sync_type:
 *           type: string
 *         start_time:
 *           type: string
 *           format: date-time
 *         end_time:
 *           type: string
 *           format: date-time
 *         duration_seconds:
 *           type: integer
 *         status:
 *           type: string
 *         total_records_processed:
 *           type: integer
 *         total_errors:
 *           type: integer
 */

/**
 * @swagger
 * /api/v1/sync/status:
 *   get:
 *     summary: Récupère le statut actuel de la synchronisation
 *     tags: [Sync]
 *     responses:
 *       200:
 *         description: Statut de synchronisation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncStatus'
 */
router.get('/status', async (req, res) => {
    try {
        const history = await syncMonitoring.getSyncHistory(1);
        const alerts = await syncMonitoring.getActiveAlerts();
        const stats = await syncMonitoring.getSyncStatistics(1);

        const currentSync = history.length > 0 ? history[0] : null;
        
        res.json({
            current_sync: currentSync,
            active_alerts: alerts.length,
            today_stats: stats,
            last_sync: currentSync ? {
                date: currentSync.end_time || currentSync.start_time,
                status: currentSync.status,
                duration: currentSync.duration_seconds,
                records: currentSync.total_records_processed,
                errors: currentSync.total_errors
            } : null
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer le statut de synchronisation'
        });
    }
});

/**
 * @swagger
 * /api/v1/sync/history:
 *   get:
 *     summary: Récupère l'historique des synchronisations
 *     tags: [Sync]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Nombre de synchronisations à retourner
 *     responses:
 *       200:
 *         description: Historique des synchronisations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 history:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SyncHistory'
 */
router.get('/history', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
        
        const history = await syncMonitoring.getSyncHistory(limit);
        
        res.json({
            history: history,
            total: history.length
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer l\'historique de synchronisation'
        });
    }
});

/**
 * @swagger
 * /api/v1/sync/alerts:
 *   get:
 *     summary: Récupère les alertes actives
 *     tags: [Sync]
 *     responses:
 *       200:
 *         description: Liste des alertes actives
 */
router.get('/alerts', async (req, res) => {
    try {
        const alerts = await syncMonitoring.getActiveAlerts();
        
        res.json({
            alerts: alerts,
            total: alerts.length
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les alertes'
        });
    }
});

/**
 * @swagger
 * /api/v1/sync/alerts/{id}/resolve:
 *   post:
 *     summary: Résout une alerte
 *     tags: [Sync]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'alerte
 *     responses:
 *       200:
 *         description: Alerte résolue avec succès
 *       404:
 *         description: Alerte non trouvée
 */
router.post('/alerts/:id/resolve', async (req, res) => {
    try {
        const alertId = parseInt(req.params.id);
        
        if (isNaN(alertId)) {
            return res.status(400).json({
                error: 'Paramètre invalide',
                message: 'L\'ID de l\'alerte doit être un nombre'
            });
        }
        
        await syncMonitoring.resolveAlert(alertId);
        
        res.json({
            message: 'Alerte résolue avec succès',
            alert_id: alertId
        });

        logger.tennis.apiRequest('POST', req.path);

    } catch (error) {
        logger.tennis.apiError('POST', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de résoudre l\'alerte'
        });
    }
});

/**
 * @swagger
 * /api/v1/sync/statistics:
 *   get:
 *     summary: Récupère les statistiques de synchronisation
 *     tags: [Sync]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 90
 *           default: 7
 *         description: Nombre de jours pour les statistiques
 *     responses:
 *       200:
 *         description: Statistiques de synchronisation
 */
router.get('/statistics', async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
        
        const stats = await syncMonitoring.getSyncStatistics(days);
        
        res.json({
            period_days: days,
            statistics: stats
        });

        logger.tennis.apiRequest('GET', req.path);

    } catch (error) {
        logger.tennis.apiError('GET', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de récupérer les statistiques'
        });
    }
});

/**
 * @swagger
 * /api/v1/sync/trigger:
 *   post:
 *     summary: Déclenche une synchronisation manuelle
 *     tags: [Sync]
 *     responses:
 *       202:
 *         description: Synchronisation déclenchée
 *       409:
 *         description: Une synchronisation est déjà en cours
 */
router.post('/trigger', async (req, res) => {
    try {
        // Vérifier si une synchronisation est déjà en cours
        const history = await syncMonitoring.getSyncHistory(1);
        const currentSync = history.length > 0 ? history[0] : null;
        
        if (currentSync && currentSync.status === 'running') {
            return res.status(409).json({
                error: 'Synchronisation en cours',
                message: 'Une synchronisation est déjà en cours d\'exécution',
                current_sync: currentSync
            });
        }
        
        // Déclencher la synchronisation en arrière-plan
        performSync().then(() => {
            logger.tennis.info('Synchronisation manuelle terminée avec succès');
        }).catch((error) => {
            logger.tennis.error('Erreur synchronisation manuelle:', error);
        });
        
        res.status(202).json({
            message: 'Synchronisation déclenchée avec succès',
            status: 'started'
        });

        logger.tennis.apiRequest('POST', req.path);

    } catch (error) {
        logger.tennis.apiError('POST', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible de déclencher la synchronisation'
        });
    }
});

/**
 * @swagger
 * /api/v1/sync/cleanup:
 *   post:
 *     summary: Nettoie les anciens logs de synchronisation
 *     tags: [Sync]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 7
 *           maximum: 365
 *           default: 30
 *         description: Nombre de jours de logs à conserver
 *     responses:
 *       200:
 *         description: Nettoyage effectué
 */
router.post('/cleanup', async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days) || 30, 7), 365);
        
        const deletedCount = await syncMonitoring.cleanOldLogs(days);
        
        res.json({
            message: 'Nettoyage effectué avec succès',
            deleted_logs: deletedCount,
            days_kept: days
        });

        logger.tennis.apiRequest('POST', req.path);

    } catch (error) {
        logger.tennis.apiError('POST', req.path, error);
        res.status(500).json({
            error: 'Erreur serveur',
            message: 'Impossible d\'effectuer le nettoyage'
        });
    }
});

module.exports = router;