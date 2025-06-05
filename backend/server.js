// =============================================
// SERVEUR PRINCIPAL - TENNIS PRONOSTICS
// =============================================

// Charger les variables d'environnement en premier
require('dotenv').config();

const logger = require('./src/utils/logger');
const config = require('./src/config/config');

// Validation de la configuration au démarrage
try {
    config.validateConfig();
    logger.info('✅ Configuration validée');
} catch (error) {
    logger.error('❌ Configuration invalide:', error.message);
    process.exit(1);
}

const app = require('./src/app');
const { testConnection } = require('./src/config/database');

const PORT = config.PORT;

// Fonction de démarrage du serveur
async function startServer() {
    try {
        // 1. Tester la connexion à la base de données
        logger.info('🔌 Test de connexion à PostgreSQL...');
        const dbConnected = await testConnection();

        if (!dbConnected) {
            throw new Error('Impossible de se connecter à PostgreSQL');
        }

        // 2. Démarrer le serveur Express
        const server = app.listen(PORT, () => {
            logger.info(`🚀 Serveur Tennis Pronostics démarré`);
            logger.info(`📡 API disponible sur: http://localhost:${PORT}${config.api.prefix}`);
            logger.info(`🌍 Environment: ${config.NODE_ENV}`);

            if (config.api.enableSwagger) {
                logger.info(`📚 Documentation API: http://localhost:${PORT}/api-docs`);
            }

            if (config.cron.enableAutoSync) {
                logger.info(`⏰ Synchronisation automatique activée: ${config.cron.syncSchedule}`);
            }
        });

        // 3. Gestion de l'arrêt propre
        setupGracefulShutdown(server);

        return server;

    } catch (error) {
        logger.error('❌ Erreur au démarrage du serveur:', error.message);
        process.exit(1);
    }
}

// Fonction d'arrêt propre du serveur
function setupGracefulShutdown(server) {
    const { closeConnection } = require('./src/config/database');

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    async function gracefulShutdown(signal) {
        logger.info(`🛑 Signal ${signal} reçu. Arrêt du serveur...`);

        // Arrêter d'accepter de nouvelles connexions
        server.close(async () => {
            logger.info('📡 Serveur HTTP fermé');

            try {
                // Fermer la connexion à la base de données
                await closeConnection();

                logger.info('✅ Arrêt du serveur terminé proprement');
                process.exit(0);
            } catch (error) {
                logger.error('❌ Erreur lors de l\'arrêt:', error.message);
                process.exit(1);
            }
        });

        // Forcer l'arrêt après 30 secondes
        setTimeout(() => {
            logger.error('⏰ Timeout: Arrêt forcé du serveur');
            process.exit(1);
        }, 30000);
    }
}

// Gestion des erreurs non gérées pour le serveur
process.on('uncaughtException', (error) => {
    logger.error('💥 Exception non gérée dans server.js:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Promise rejetée non gérée dans server.js:', reason);
    process.exit(1);
});

// Démarrer le serveur seulement si ce fichier est exécuté directement
if (require.main === module) {
    startServer();
}

module.exports = { startServer };