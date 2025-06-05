// =============================================
// APPLICATION EXPRESS - TENNIS PRONOSTICS
// =============================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const config = require('./config/config');
const logger = require('./utils/logger');

const app = express();

// =============================================
// MIDDLEWARES GLOBAUX
// =============================================

// Sécurité
if (config.security.enableHelmet) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
    }));
}

// CORS
app.use(cors(config.cors));

// Compression
if (config.security.enableCompression) {
    app.use(compression());
}

// Parsing du body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging des requêtes HTTP
if (config.isDevelopment()) {
    app.use(morgan('dev', { stream: logger.stream }));
} else {
    app.use(morgan('combined', { stream: logger.stream }));
}

// Rate limiting
if (config.api.enableRateLimiting) {
    const limiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: config.api.maxRequestsPerMinute,
        message: {
            error: 'Trop de requêtes, veuillez réessayer plus tard',
            retryAfter: 60
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

    app.use(limiter);
}

// =============================================
// ROUTES DE SANTÉ
// =============================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
        version: require('../package.json').version
    });
});

// Status détaillé
app.get('/status', async (req, res) => {
    try {
        const { testConnection } = require('./config/database');
        const dbStatus = await testConnection();

        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            environment: config.NODE_ENV,
            version: require('../package.json').version,
            database: dbStatus ? 'connected' : 'disconnected',
            services: {
                api: 'running',
                cron: config.cron.enableAutoSync ? 'enabled' : 'disabled',
                cache: config.cache.enabled ? 'enabled' : 'disabled'
            }
        });
    } catch (error) {
        logger.error('Erreur status:', error);
        res.status(500).json({
            status: 'ERROR',
            message: 'Erreur lors de la vérification du statut'
        });
    }
});

// =============================================
// DOCUMENTATION API (SWAGGER)
// =============================================

if (config.api.enableSwagger) {
    const swaggerJsdoc = require('swagger-jsdoc');
    const swaggerUi = require('swagger-ui-express');

    const options = {
        definition: {
            openapi: '3.0.0',
            info: {
                title: 'Tennis Pronostics API',
                version: '1.0.0',
                description: 'API pour l\'application de pronostics tennis',
                contact: {
                    name: 'Support API',
                    email: 'support@tennis-pronostics.com'
                }
            },
            servers: [
                {
                    url: `http://${config.api.swaggerHost}${config.api.prefix}`,
                    description: 'Serveur de développement'
                }
            ],
            components: {
                schemas: {
                    Error: {
                        type: 'object',
                        properties: {
                            error: { type: 'string' },
                            message: { type: 'string' },
                            timestamp: { type: 'string' }
                        }
                    }
                }
            }
        },
        apis: ['./src/routes/*.js'], // Chemins vers les fichiers contenant les annotations
    };

    const specs = swaggerJsdoc(options);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}

// =============================================
// ROUTES API
// =============================================

// Route de base
app.get('/', (req, res) => {
    res.json({
        message: '🎾 Tennis Pronostics API',
        version: require('../package.json').version,
        environment: config.NODE_ENV,
        documentation: config.api.enableSwagger ? '/api-docs' : null,
        endpoints: {
            health: '/health',
            status: '/status',
            api: config.api.prefix
        }
    });
});

// Routes API principales (à créer)
// app.use(config.api.prefix + '/players', require('./routes/players'));
// app.use(config.api.prefix + '/tournaments', require('./routes/tournaments'));
// app.use(config.api.prefix + '/matches', require('./routes/matches'));
// app.use(config.api.prefix + '/stats', require('./routes/stats'));

// Route temporaire pour tester
app.get(config.api.prefix, (req, res) => {
    res.json({
        message: '🎾 Tennis Pronostics API v1',
        available_endpoints: [
            'GET /players - Liste des joueurs',
            'GET /tournaments - Liste des tournois',
            'GET /matches - Liste des matchs',
            'GET /stats - Statistiques'
        ],
        note: 'Endpoints en cours de développement'
    });
});

// =============================================
// ROUTES DE DEBUG (développement uniquement)
// =============================================

if (config.development.enableDebugRoutes && config.isDevelopment()) {
    app.get('/debug/config', (req, res) => {
        // Ne pas exposer les secrets
        const safeConfig = { ...config };
        delete safeConfig.security;
        delete safeConfig.email;

        res.json(safeConfig);
    });

    app.get('/debug/env', (req, res) => {
        const safeEnv = {};
        Object.keys(process.env).forEach(key => {
            if (!key.includes('PASSWORD') && !key.includes('SECRET') && !key.includes('KEY')) {
                safeEnv[key] = process.env[key];
            }
        });
        res.json(safeEnv);
    });
}

// =============================================
// GESTION DES ERREURS
// =============================================

// Route non trouvée
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        message: `La route ${req.method} ${req.originalUrl} n'existe pas`,
        timestamp: new Date().toISOString()
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    logger.error('Erreur Express:', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    // Ne pas exposer les détails en production
    const message = config.isProduction()
        ? 'Erreur interne du serveur'
        : error.message;

    res.status(error.status || 500).json({
        error: 'Erreur serveur',
        message,
        timestamp: new Date().toISOString(),
        ...(config.isDevelopment() && { stack: error.stack })
    });
});

module.exports = app;