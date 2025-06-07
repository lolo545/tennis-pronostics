// =============================================
// CONFIGURATION PRINCIPALE DE L'APPLICATION
// =============================================

// S'assurer que dotenv est chargé
require('dotenv').config();

const config = {
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 3001,

    // API Configuration
    api: {
        prefix: process.env.API_PREFIX || '/api/v1',
        maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 100,
        enableRateLimiting: process.env.ENABLE_RATE_LIMITING === 'true',
        enableSwagger: process.env.ENABLE_SWAGGER === 'true',
        swaggerHost: process.env.SWAGGER_HOST || 'localhost:3001'
    },

    // CORS Configuration
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: process.env.CORS_CREDENTIALS === 'true',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || 'logs/app.log',
        enableConsole: process.env.ENABLE_CONSOLE_LOGS !== 'false',
        format: process.env.NODE_ENV === 'production' ? 'json' : 'simple'
    },

    // Cron Jobs Configuration
    cron: {
        enableAutoSync: process.env.ENABLE_AUTO_SYNC === 'true',
        syncSchedule: process.env.SYNC_CRON_SCHEDULE || '0 8,20 * * *',
        timezone: 'Europe/Paris'
    },

    // Cache Configuration (Redis)
    cache: {
        enabled: process.env.ENABLE_CACHE === 'true',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || null,
        ttl: 3600
    },

    // Security Configuration
    security: {
        jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
        enableHelmet: true,
        enableCompression: true
    },

    // External APIs
    externalApis: {
        tennisApiKey: process.env.TENNIS_API_KEY,
        oddsApiKey: process.env.ODDS_API_KEY
    },

    // Email Configuration
    email: {
        smtp: {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        },
        from: process.env.FROM_EMAIL || 'noreply@tennis-pronostics.com'
    },

    // Monitoring
    monitoring: {
        enabled: process.env.ENABLE_MONITORING === 'true',
        sentryDsn: process.env.SENTRY_DSN
    },

    // Development
    development: {
        enableDebugRoutes: process.env.ENABLE_DEBUG_ROUTES === 'true',
        mockExternalApis: process.env.NODE_ENV === 'development'
    },

    // Tennis specific configuration
    tennis: {
        surfaces: ['Hard', 'Clay', 'Grass', 'Carpet', 'Indoor Hard'],
        tours: ['ATP', 'WTA'],
        roundTypes: {
            qualifying: ['Q1', 'Q2', 'Q3'],
            main: ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F']
        },
        atpLevels: {
            1: 'Grand Slam',
            2: 'Masters 1000',
            3: 'ATP 500',
            4: 'ATP 250',
            5: 'Challenger',
            6: 'ITF',
            7: 'Futures',
            8: 'Davis Cup',
            9: 'Olympics'
        },
        sync: {
            batchSize: 1000,
            maxRetries: 3,
            retryDelay: 5000,
            timeoutMs: 30000
        }
    }
};

// Validation de la configuration
function validateConfig() {
    const errors = [];
    if (!process.env.PG_PASSWORD) {
        errors.push('PG_PASSWORD est requis');
    }
    if (!process.env.ACCESS_CONNECTION_STRING) {
        errors.push('ACCESS_CONNECTION_STRING est requis pour la synchronisation');
    }
    if (config.NODE_ENV === 'production') {
        if (config.security.jwtSecret === 'default-secret-change-me') {
            errors.push('JWT_SECRET doit être défini en production');
        }
        if (!config.monitoring.sentryDsn && config.monitoring.enabled) {
            errors.push('SENTRY_DSN requis si monitoring activé');
        }
    }
    if (errors.length > 0) {
        throw new Error(`Configuration invalide:\n${errors.join('\n')}`);
    }
}

// Fonctions d'aide
function isDevelopment() {
    return config.NODE_ENV === 'development';
}

function isProduction() {
    return config.NODE_ENV === 'production';
}

function isTest() {
    return config.NODE_ENV === 'test';
}

module.exports = {
    ...config,
    validateConfig,
    isDevelopment,
    isProduction,
    isTest
};