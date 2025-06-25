// =============================================
// SERVICE DE MONITORING DE SYNCHRONISATION
// =============================================

const { Client } = require('pg');
require('dotenv').config();

// Logger simple pour éviter les dépendances
const logger = {
    info: (message) => console.log(`ℹ️  ${message}`),
    warn: (message) => console.warn(`⚠️  ${message}`),
    error: (message, error) => {
        console.error(`❌ ${message}`);
        if (error) console.error(error);
    }
};

class SyncMonitoring {
    constructor() {
        this.pgConfig = {
            host: process.env.PG_HOST || 'localhost',
            port: process.env.PG_PORT || 5432,
            database: process.env.PG_DATABASE || 'tennis_pronostics',
            user: process.env.PG_USER || 'postgres',
            password: process.env.PG_PASSWORD
        };
    }

    // =============================================
    // INITIALISATION DES TABLES DE MONITORING
    // =============================================

    async initializeMonitoring() {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            // Table des logs de synchronisation
            await client.query(`
                CREATE TABLE IF NOT EXISTS sync_log (
                    id SERIAL PRIMARY KEY,
                    sync_type VARCHAR(20) NOT NULL DEFAULT 'incremental',
                    start_time TIMESTAMP NOT NULL,
                    end_time TIMESTAMP,
                    duration_seconds BIGINT,
                    status VARCHAR(20) NOT NULL DEFAULT 'running',
                    last_sync_date TIMESTAMP,
                    total_records_processed INTEGER DEFAULT 0,
                    total_errors INTEGER DEFAULT 0,
                    sync_stats JSONB,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Table des métriques de synchronisation
            await client.query(`
                CREATE TABLE IF NOT EXISTS sync_metrics (
                    id SERIAL PRIMARY KEY,
                    sync_log_id INTEGER REFERENCES sync_log(id) ON DELETE CASCADE,
                    table_name VARCHAR(50) NOT NULL,
                    operation VARCHAR(20) NOT NULL,
                    records_processed INTEGER DEFAULT 0,
                    records_inserted INTEGER DEFAULT 0,
                    records_updated INTEGER DEFAULT 0,
                    records_failed INTEGER DEFAULT 0,
                    processing_time_ms BIGINT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Table des alertes de synchronisation
            await client.query(`
                CREATE TABLE IF NOT EXISTS sync_alerts (
                    id SERIAL PRIMARY KEY,
                    sync_log_id INTEGER REFERENCES sync_log(id) ON DELETE CASCADE,
                    alert_type VARCHAR(20) NOT NULL,
                    severity VARCHAR(10) NOT NULL DEFAULT 'info',
                    message TEXT NOT NULL,
                    details JSONB,
                    resolved BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP
                );
            `);

            // Index pour les performances
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_sync_log_start_time ON sync_log(start_time);
                CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
                CREATE INDEX IF NOT EXISTS idx_sync_metrics_sync_log_id ON sync_metrics(sync_log_id);
                CREATE INDEX IF NOT EXISTS idx_sync_alerts_unresolved ON sync_alerts(resolved) WHERE resolved = FALSE;
            `);

            logger.info('Tables de monitoring initialisées avec succès');
            
        } catch (error) {
            logger.error('Erreur initialisation monitoring:', error);
            throw error;
        } finally {
            await client.end();
        }
    }

    // =============================================
    // GESTION DES SESSIONS DE SYNCHRONISATION
    // =============================================

    async startSyncSession(syncType = 'incremental', lastSyncDate = null) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            const result = await client.query(`
                INSERT INTO sync_log (sync_type, start_time, last_sync_date, status)
                VALUES ($1, $2, $3, 'running')
                RETURNING id
            `, [syncType, new Date(), lastSyncDate]);

            const sessionId = result.rows[0].id;
            
            logger.info(`Session de synchronisation démarrée: ${sessionId}`);
            
            return sessionId;
            
        } catch (error) {
            logger.error('Erreur démarrage session sync:', error);
            throw error;
        } finally {
            await client.end();
        }
    }

    async endSyncSession(sessionId, status, stats = {}, errorMessage = null) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            const endTime = new Date();
            
            // Récupérer l'heure de début pour calculer la durée
            const startResult = await client.query(`
                SELECT start_time FROM sync_log WHERE id = $1
            `, [sessionId]);
            
            if (startResult.rows.length === 0) {
                throw new Error(`Session de synchronisation ${sessionId} non trouvée`);
            }
            
            const startTime = startResult.rows[0].start_time;
            const durationSeconds = Math.round((endTime - startTime) / 1000);
            
            // Calculer le total des enregistrements traités et des erreurs
            const totalProcessed = Object.values(stats).reduce((sum, val) => {
                return sum + (typeof val === 'number' && val < 2147483647 ? val : 0); // Limite INTEGER
            }, 0);
            
            const totalErrors = (stats.errors && stats.errors < 2147483647) ? stats.errors : 0;
            
            await client.query(`
                UPDATE sync_log 
                SET end_time = $1, 
                    duration_seconds = $2, 
                    status = $3,
                    total_records_processed = $4,
                    total_errors = $5,
                    sync_stats = $6,
                    error_message = $7
                WHERE id = $8
            `, [endTime, durationSeconds, status, totalProcessed, totalErrors, JSON.stringify(stats), errorMessage, sessionId]);

            logger.info(`Session de synchronisation terminée: ${sessionId} (${status}, ${durationSeconds}s)`);
            
            // Créer des alertes si nécessaire
            await this.checkAndCreateAlerts(client, sessionId, stats, status);
            
        } catch (error) {
            logger.error('Erreur fin session sync:', error);
            throw error;
        } finally {
            await client.end();
        }
    }

    // =============================================
    // GESTION DES MÉTRIQUES
    // =============================================

    async recordTableMetrics(sessionId, tableName, operation, metrics) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            // Limiter les valeurs à la taille INTEGER de PostgreSQL
            const safeValue = (val) => Math.min(val || 0, 2147483647);
            
            await client.query(`
                INSERT INTO sync_metrics (
                    sync_log_id, table_name, operation, 
                    records_processed, records_inserted, records_updated, records_failed,
                    processing_time_ms
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                sessionId, tableName, operation,
                safeValue(metrics.processed),
                safeValue(metrics.inserted),
                safeValue(metrics.updated),
                safeValue(metrics.failed),
                safeValue(metrics.processingTimeMs)
            ]);
            
        } catch (error) {
            logger.error('Erreur enregistrement métriques:', error);
        } finally {
            await client.end();
        }
    }

    // =============================================
    // GESTION DES ALERTES
    // =============================================

    async createAlert(sessionId, alertType, severity, message, details = null) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            await client.query(`
                INSERT INTO sync_alerts (sync_log_id, alert_type, severity, message, details)
                VALUES ($1, $2, $3, $4, $5)
            `, [sessionId, alertType, severity, message, JSON.stringify(details)]);

            logger.warn(`Alerte créée: ${alertType} - ${message}`);
            
        } catch (error) {
            logger.error('Erreur création alerte:', error);
        } finally {
            await client.end();
        }
    }

    async checkAndCreateAlerts(client, sessionId, stats, status) {
        try {
            // Alerte si échec de synchronisation
            if (status === 'failed') {
                await client.query(`
                    INSERT INTO sync_alerts (sync_log_id, alert_type, severity, message)
                    VALUES ($1, 'sync_failed', 'error', 'Échec de la synchronisation')
                `, [sessionId]);
            }

            // Alerte si trop d'erreurs
            const totalErrors = stats.errors || 0;
            const totalProcessed = Object.values(stats).reduce((sum, val) => {
                return sum + (typeof val === 'number' ? val : 0);
            }, 0);

            if (totalErrors > 0 && totalProcessed > 0) {
                const errorRate = (totalErrors / totalProcessed) * 100;
                
                if (errorRate > 10) {
                    await client.query(`
                        INSERT INTO sync_alerts (sync_log_id, alert_type, severity, message, details)
                        VALUES ($1, 'high_error_rate', 'warning', 'Taux d''erreur élevé', $2)
                    `, [sessionId, JSON.stringify({ errorRate: errorRate.toFixed(2) })]);
                }
            }

            // Alerte si aucune donnée synchronisée
            if (totalProcessed === 0 && status === 'completed') {
                await client.query(`
                    INSERT INTO sync_alerts (sync_log_id, alert_type, severity, message)
                    VALUES ($1, 'no_data', 'info', 'Aucune nouvelle donnée à synchroniser')
                `, [sessionId]);
            }

        } catch (error) {
            logger.error('Erreur vérification alertes:', error);
        }
    }

    // =============================================
    // RAPPORTS ET STATISTIQUES
    // =============================================

    async getSyncHistory(limit = 10) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            const result = await client.query(`
                SELECT 
                    id, sync_type, start_time, end_time, duration_seconds,
                    status, total_records_processed, total_errors,
                    sync_stats, error_message
                FROM sync_log
                ORDER BY start_time DESC
                LIMIT $1
            `, [limit]);

            return result.rows;
            
        } catch (error) {
            logger.error('Erreur récupération historique:', error);
            return [];
        } finally {
            await client.end();
        }
    }

    async getActiveAlerts() {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            const result = await client.query(`
                SELECT 
                    a.id, a.sync_log_id, a.alert_type, a.severity,
                    a.message, a.details, a.created_at,
                    s.start_time as sync_start_time
                FROM sync_alerts a
                JOIN sync_log s ON a.sync_log_id = s.id
                WHERE a.resolved = FALSE
                ORDER BY a.created_at DESC
            `);

            return result.rows;
            
        } catch (error) {
            logger.error('Erreur récupération alertes:', error);
            return [];
        } finally {
            await client.end();
        }
    }

    async getSyncStatistics(days = 7) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            const result = await client.query(`
                SELECT 
                    COUNT(*) as total_syncs,
                    COUNT(*) FILTER (WHERE status = 'completed') as successful_syncs,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed_syncs,
                    AVG(duration_seconds) as avg_duration,
                    SUM(total_records_processed) as total_records,
                    SUM(total_errors) as total_errors
                FROM sync_log
                WHERE start_time >= NOW() - INTERVAL '${days} days'
            `);

            return result.rows[0];
            
        } catch (error) {
            logger.error('Erreur récupération statistiques:', error);
            return {};
        } finally {
            await client.end();
        }
    }

    async resolveAlert(alertId) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            await client.query(`
                UPDATE sync_alerts 
                SET resolved = TRUE, resolved_at = NOW()
                WHERE id = $1
            `, [alertId]);

            logger.info(`Alerte résolue: ${alertId}`);
            
        } catch (error) {
            logger.error('Erreur résolution alerte:', error);
        } finally {
            await client.end();
        }
    }

    // =============================================
    // NETTOYAGE DES ANCIENS LOGS
    // =============================================

    async cleanOldLogs(daysToKeep = 30) {
        const client = new Client(this.pgConfig);
        
        try {
            await client.connect();
            
            const result = await client.query(`
                DELETE FROM sync_log 
                WHERE start_time < NOW() - INTERVAL '${daysToKeep} days'
            `);

            const deletedCount = result.rowCount;
            
            if (deletedCount > 0) {
                logger.info(`Nettoyage effectué: ${deletedCount} anciens logs supprimés`);
            }
            
            return deletedCount;
            
        } catch (error) {
            logger.error('Erreur nettoyage logs:', error);
            return 0;
        } finally {
            await client.end();
        }
    }
}

module.exports = new SyncMonitoring();