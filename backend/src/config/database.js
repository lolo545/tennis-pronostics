// =============================================
// CONFIGURATION BASE DE DONNÉES
// =============================================

const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Configuration selon l'environnement
const config = {
    development: {
        host: process.env.PG_HOST,
        port: process.env.PG_PORT,
        database: process.env.PG_DATABASE,
        username: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        dialect: 'postgres',
        logging: (msg) => logger.debug(msg),
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: true,
            freezeTableName: true
        }
    },

    production: {
        host: process.env.PG_HOST,
        port: process.env.PG_PORT,
        database: process.env.PG_DATABASE,
        username: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        dialect: 'postgres',
        logging: false, // Désactiver les logs SQL en production
        pool: {
            max: 20,
            min: 5,
            acquire: 60000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: true,
            freezeTableName: true
        },
        dialectOptions: {
            ssl: process.env.DATABASE_SSL === 'true' ? {
                require: true,
                rejectUnauthorized: false
            } : false
        }
    },

    test: {
        host: process.env.PG_HOST,
        port: process.env.PG_PORT ,
        database: process.env.PG_TEST_DATABASE ,
        username: process.env.PG_USER ,
        password: process.env.PG_PASSWORD,
        dialect: 'postgres',
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
};

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Créer l'instance Sequelize
const sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    dbConfig
);

// Fonction de test de connexion
async function testConnection() {
    try {
        await sequelize.authenticate();
        logger.info('✅ Connexion PostgreSQL établie avec succès');
        return true;
    } catch (error) {
        logger.error('❌ Erreur de connexion PostgreSQL:', error.message);
        return false;
    }
}

// Fonction de synchronisation (attention en production!)
async function syncDatabase(options = {}) {
    try {
        const { force = false, alter = false } = options;

        if (env === 'production' && force) {
            throw new Error('SYNC FORCE interdit en production !');
        }

        await sequelize.sync({ force, alter });
        logger.info('🔄 Base de données synchronisée');
        return true;
    } catch (error) {
        logger.error('❌ Erreur synchronisation:', error.message);
        return false;
    }
}

// Fonction de fermeture propre
async function closeConnection() {
    try {
        await sequelize.close();
        logger.info('🔌 Connexion PostgreSQL fermée');
    } catch (error) {
        logger.error('❌ Erreur fermeture connexion:', error.message);
    }
}

// Configuration pour les migrations existantes
const accessConfig = {
    connectionString: process.env.ACCESS_CONNECTION_STRING
};

module.exports = {
    sequelize,
    config: dbConfig,
    accessConfig,
    testConnection,
    syncDatabase,
    closeConnection,

    // Pour compatibilité avec vos scripts existants
    pgConfig: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.username,
        password: dbConfig.password
    }
};