// =============================================
// SYSTÈME DE LOGGING WINSTON
// =============================================

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Configuration directe depuis les variables d'environnement pour éviter la dépendance circulaire
require('dotenv').config();

const loggingConfig = {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
    enableConsole: process.env.ENABLE_CONSOLE_LOGS !== 'false',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'simple'
};

// Créer le dossier logs s'il n'existe pas
const logsDir = path.dirname(loggingConfig.file);
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Format personnalisé pour les logs
const customFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

        // Ajouter la stack trace pour les erreurs
        if (stack) {
            log += `\n${stack}`;
        }

        // Ajouter les métadonnées s'il y en a
        if (Object.keys(meta).length > 0) {
            log += `\n${JSON.stringify(meta, null, 2)}`;
        }

        return log;
    })
);

// Format JSON pour la production
const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Configuration des transports
const transports = [];

// Transport fichier toujours actif
transports.push(
    new winston.transports.File({
        filename: loggingConfig.file,
        level: loggingConfig.level,
        format: loggingConfig.format === 'json' ? jsonFormat : customFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
    })
);

// Transport console selon configuration
if (loggingConfig.enableConsole) {
    transports.push(
        new winston.transports.Console({
            level: loggingConfig.level,
            format: winston.format.combine(
                winston.format.colorize(),
                customFormat
            )
        })
    );
}

// Créer le logger
const logger = winston.createLogger({
    level: loggingConfig.level,
    transports,
    // Ne pas sortir les erreurs non gérées
    exitOnError: false
});

// Fonctions d'aide spécifiques au tennis
const tennisLogger = {
    // Log de synchronisation
    syncStart: (tour) => {
        logger.info(`🔄 Début synchronisation ${tour}`, {
            action: 'sync_start',
            tour,
            timestamp: new Date().toISOString()
        });
    },

    syncEnd: (tour, stats) => {
        logger.info(`✅ Synchronisation ${tour} terminée`, {
            action: 'sync_end',
            tour,
            stats,
            timestamp: new Date().toISOString()
        });
    },

    syncError: (tour, error) => {
        logger.error(`❌ Erreur synchronisation ${tour}`, {
            action: 'sync_error',
            tour,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    },

    // Log de migration
    migrationStart: (type) => {
        logger.info(`📦 Début migration ${type}`, {
            action: 'migration_start',
            type,
            timestamp: new Date().toISOString()
        });
    },

    migrationEnd: (type, recordsProcessed) => {
        logger.info(`✅ Migration ${type} terminée: ${recordsProcessed} enregistrements`, {
            action: 'migration_end',
            type,
            recordsProcessed,
            timestamp: new Date().toISOString()
        });
    },

    // Log d'API
    apiRequest: (method, url, userId = null) => {
        logger.info(`📡 ${method} ${url}`, {
            action: 'api_request',
            method,
            url,
            userId,
            timestamp: new Date().toISOString()
        });
    },

    apiError: (method, url, error, userId = null) => {
        logger.error(`❌ API Error ${method} ${url}`, {
            action: 'api_error',
            method,
            url,
            error: error.message,
            userId,
            timestamp: new Date().toISOString()
        });
    },

    // Log de base de données
    dbQuery: (query, duration) => {
        if (process.env.NODE_ENV === 'development') {
            logger.debug(`💾 DB Query (${duration}ms): ${query.substring(0, 100)}...`, {
                action: 'db_query',
                duration,
                query: query.substring(0, 200)
            });
        }
    },

    dbError: (error, query = null) => {
        logger.error(`❌ DB Error: ${error.message}`, {
            action: 'db_error',
            error: error.message,
            query: query ? query.substring(0, 200) : null,
            stack: error.stack
        });
    }
};

// Stream pour Morgan (logs HTTP)
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

// Gestion des erreurs non gérées
if (process.env.NODE_ENV !== 'test') {
    process.on('uncaughtException', (error) => {
        logger.error('💥 Uncaught Exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('💥 Unhandled Rejection at:', { promise, reason });
    });
}

module.exports = {
    // Méthodes principales du logger Winston
    info: (message, meta = {}) => logger.info(message, meta),
    error: (message, meta = {}) => logger.error(message, meta),
    warn: (message, meta = {}) => logger.warn(message, meta),
    debug: (message, meta = {}) => logger.debug(message, meta),

    // Accès direct au logger Winston si nécessaire
    winston: logger,

    // Stream pour Morgan
    stream: {
        write: (message) => {
            logger.info(message.trim());
        }
    },

    // Fonctions tennis spécialisées
    tennis: tennisLogger,

    // Fonction d'aide pour créer des logs structurés
    createLogger: (service) => ({
        info: (message, meta = {}) => logger.info(message, { service, ...meta }),
        error: (message, meta = {}) => logger.error(message, { service, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { service, ...meta }),
        debug: (message, meta = {}) => logger.debug(message, { service, ...meta })
    })
};