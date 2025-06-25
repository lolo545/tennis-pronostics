// =============================================
// MISE À JOUR DES ELO DEPUIS LES FICHIERS EXCEL
// =============================================

const XLSX = require('xlsx');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config();

// Configuration PostgreSQL
const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'tennis_pronostics',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD
};

let pgDB;

// Logger simple
const logger = {
    info: (message) => console.log(`ℹ️  ${message}`),
    warn: (message) => console.warn(`⚠️  ${message}`),
    error: (message, error) => {
        console.error(`❌ ${message}`);
        if (error) console.error(error);
    }
};

// Listes pour le suivi
let updatedPlayers = [];
let notFoundPlayers = [];
let ambiguousPlayers = [];

// =============================================
// FONCTION PRINCIPALE
// =============================================

async function updateEloFromExcel() {
    console.log('\n🎾 MISE À JOUR DES ELO DEPUIS LES FICHIERS EXCEL');
    console.log('===============================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    try {
        await connectDatabase();
        
        // Lire les fichiers Excel
        console.log('📊 Lecture des fichiers Excel...');
        const menEloData = readExcelFile('Elo_Man.xlsx', 'ATP');
        const womenEloData = readExcelFile('Elo_Woman.xlsx', 'WTA');
        
        console.log(`   - Hommes (ATP): ${menEloData.length} joueurs`);
        console.log(`   - Femmes (WTA): ${womenEloData.length} joueuses`);
        
        // Combiner les données
        const allEloData = [...menEloData, ...womenEloData];
        console.log(`   - Total: ${allEloData.length} joueurs/joueuses`);
        
        // Traitement par lots
        const batchSize = 50;
        let processed = 0;
        
        for (let i = 0; i < allEloData.length; i += batchSize) {
            const batch = allEloData.slice(i, i + batchSize);
            
            console.log(`\n🔄 Traitement du lot ${Math.floor(i / batchSize) + 1}/${Math.ceil(allEloData.length / batchSize)}...`);
            
            for (const eloEntry of batch) {
                await processPlayerElo(eloEntry);
                processed++;
                
                if (processed % 20 === 0) {
                    const progress = Math.round((processed / allEloData.length) * 100);
                    console.log(`    Progress: ${processed}/${allEloData.length} (${progress}%)`);
                }
            }
        }
        
        console.log('\n✅ MISE À JOUR TERMINÉE');
        await displayFinalStats();
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    } finally {
        await closeDatabase();
    }
}

// =============================================
// LECTURE DES FICHIERS EXCEL
// =============================================

function readExcelFile(filename, tour) {
    try {
        const filePath = path.join(__dirname, '..', filename);
        console.log(`   📂 Lecture de ${filename}...`);
        
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convertir en JSON
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        // Analyser la structure pour identifier les colonnes
        if (data.length === 0) {
            console.warn(`   ⚠️  Fichier ${filename} vide`);
            return [];
        }
        
        // Afficher les colonnes disponibles pour les deux fichiers
        console.log(`   📋 Colonnes détectées dans ${filename}:`, Object.keys(data[0]).join(', '));
        
        // Analyser les colonnes ELO pour débogage
        const eloColumns = Object.keys(data[0]).filter(key => key.toLowerCase().includes('elo'));
        if (eloColumns.length > 0) {
            console.log(`   🎯 Colonnes ELO trouvées:`, eloColumns.join(', '));
        }
        
        // Mapper les données avec détection automatique des colonnes
        return data.map(row => {
            const mapped = {
                tour: tour,
                originalData: row
            };
            
            // Détecter les colonnes de nom (variations possibles)
            const nameKeys = Object.keys(row).filter(key => 
                key.toLowerCase().includes('name') || 
                key.toLowerCase().includes('nom') ||
                key.toLowerCase().includes('player') ||
                key.toLowerCase().includes('joueur')
            );
            
            if (nameKeys.length > 0) {
                mapped.name = row[nameKeys[0]];
            } else {
                // Prendre la première colonne comme nom par défaut
                const firstKey = Object.keys(row)[0];
                mapped.name = row[firstKey];
            }
            
            // Détecter les colonnes ELO
            Object.keys(row).forEach(key => {
                const keyLower = key.toLowerCase();
                if (keyLower.includes('elo')) {
                    if (keyLower.includes('clay') || keyLower.includes('terre')) {
                        mapped.elo_clay = parseInt(row[key]) || null;
                    } else if (keyLower.includes('grass') || keyLower.includes('gazon')) {
                        mapped.elo_grass = parseInt(row[key]) || null;
                    } else if (keyLower.includes('ihard') || keyLower.includes('indoor_hard') || keyLower.includes('hard_indoor') || (keyLower.includes('hard') && keyLower.includes('indoor'))) {
                        mapped.elo_ihard = parseInt(row[key]) || null;
                    } else if (keyLower.includes('hard')) {
                        mapped.elo_hard = parseInt(row[key]) || null;
                    } else if (keyLower === 'elo' || keyLower.includes('general')) {
                        mapped.elo = parseInt(row[key]) || null;
                    }
                }
            });
            
            // Si pas d'ELO général trouvé, chercher une colonne numérique qui pourrait être l'ELO
            if (!mapped.elo) {
                const numericKeys = Object.keys(row).filter(key => 
                    !isNaN(row[key]) && parseInt(row[key]) > 1000 && parseInt(row[key]) < 3000
                );
                if (numericKeys.length > 0) {
                    mapped.elo = parseInt(row[numericKeys[0]]) || null;
                }
            }
            
            return mapped;
        });
        
        const filteredData = data.filter(item => item.name && item.name.trim() !== '');
        
        // Afficher des exemples de mapping pour débogage
        if (filteredData.length > 0) {
            const firstMapping = filteredData[0];
            console.log(`   🔍 Exemple de mapping pour "${firstMapping.name}":`);
            console.log(`      - ELO général: ${firstMapping.elo}`);
            console.log(`      - ELO clay: ${firstMapping.elo_clay}`);
            console.log(`      - ELO grass: ${firstMapping.elo_grass}`);
            console.log(`      - ELO hard: ${firstMapping.elo_hard}`);
            console.log(`      - ELO ihard: ${firstMapping.elo_ihard}`);
        }
        
        return filteredData;
        
    } catch (error) {
        console.error(`   ❌ Erreur lecture ${filename}:`, error.message);
        return [];
    }
}

// =============================================
// TRAITEMENT D'UN JOUEUR
// =============================================

async function processPlayerElo(eloEntry) {
    try {
        const { name, tour, elo, elo_clay, elo_grass, elo_hard, elo_ihard } = eloEntry;
        
        // Nettoyer et normaliser le nom
        const cleanName = cleanPlayerName(name);
        
        if (!cleanName) {
            console.log(`   ⚠️  Nom invalide ignoré: "${name}"`);
            return;
        }
        
        // Chercher le joueur dans la base
        const matchingPlayers = await findMatchingPlayers(cleanName, tour);
        
        if (matchingPlayers.length === 0) {
            notFoundPlayers.push({
                excelName: name,
                cleanName: cleanName,
                tour: tour,
                elo: elo
            });
            console.log(`   🔍 Non trouvé: ${cleanName} (${tour})`);
            return;
        }
        
        if (matchingPlayers.length > 1) {
            ambiguousPlayers.push({
                excelName: name,
                cleanName: cleanName,
                tour: tour,
                matches: matchingPlayers.map(p => p.full_name),
                elo: elo
            });
            console.log(`   ❓ Ambigu: ${cleanName} (${tour}) - ${matchingPlayers.length} correspondances`);
            return;
        }
        
        // Joueur unique trouvé
        const player = matchingPlayers[0];
        await updatePlayerLastMatchElo(player.id, eloEntry);
        
        updatedPlayers.push({
            excelName: name,
            dbName: player.full_name,
            playerId: player.id,
            tour: tour,
            elo: elo
        });
        
        console.log(`   ✅ Mis à jour: ${player.full_name} (ID: ${player.id}) - ELO: ${elo}`);
        
    } catch (error) {
        console.error(`   ❌ Erreur traitement ${name}:`, error.message);
    }
}

// =============================================
// UTILITAIRES DE CORRESPONDANCE
// =============================================

function cleanPlayerName(name) {
    if (!name || typeof name !== 'string') return null;
    
    return name
        .trim()
        .replace(/\s+/g, ' ')           // Espaces multiples
        .replace(/[^\w\s\-'\.]/g, '')   // Caractères spéciaux sauf - ' .
        .toLowerCase();
}

async function findMatchingPlayers(cleanName, tour) {
    try {
        // Recherche exacte d'abord
        let query = `
            SELECT id, full_name, first_name, last_name, tour
            FROM players 
            WHERE LOWER(full_name) = $1 AND tour = $2
        `;
        
        let result = await pgDB.query(query, [cleanName, tour]);
        
        if (result.rows.length > 0) {
            return result.rows;
        }
        
        // Recherche avec variantes (inversion prénom/nom)
        const nameParts = cleanName.split(' ');
        if (nameParts.length >= 2) {
            const reversed = `${nameParts[nameParts.length - 1]} ${nameParts.slice(0, -1).join(' ')}`;
            
            query = `
                SELECT id, full_name, first_name, last_name, tour
                FROM players 
                WHERE LOWER(full_name) = $1 AND tour = $2
            `;
            
            result = await pgDB.query(query, [reversed, tour]);
            
            if (result.rows.length > 0) {
                return result.rows;
            }
        }
        
        // Recherche floue (LIKE)
        query = `
            SELECT id, full_name, first_name, last_name, tour
            FROM players 
            WHERE LOWER(full_name) LIKE $1 AND tour = $2
            LIMIT 5
        `;
        
        result = await pgDB.query(query, [`%${cleanName}%`, tour]);
        
        // Filtrer pour éviter les correspondances trop larges
        return result.rows.filter(player => {
            const similarity = calculateSimilarity(cleanName, player.full_name.toLowerCase());
            return similarity > 0.8; // Seuil de similarité
        });
        
    } catch (error) {
        console.error('Erreur recherche joueur:', error.message);
        return [];
    }
}

function calculateSimilarity(str1, str2) {
    // Similarité basée sur la distance de Levenshtein normalisée
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    const distance = levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
}

function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

// =============================================
// MISE À JOUR DES ELO
// =============================================

async function updatePlayerLastMatchElo(playerId, eloData) {
    try {
        // Trouver le dernier match du joueur
        const lastMatchQuery = `
            SELECT id, match_date, winner_id, loser_id
            FROM matches 
            WHERE (winner_id = $1 OR loser_id = $1)
            ORDER BY match_date DESC, id DESC
            LIMIT 1
        `;
        
        const lastMatchResult = await pgDB.query(lastMatchQuery, [playerId]);
        
        if (lastMatchResult.rows.length === 0) {
            console.log(`     ⚠️  Aucun match trouvé pour le joueur ID ${playerId}`);
            return;
        }
        
        const match = lastMatchResult.rows[0];
        const isWinner = match.winner_id === playerId;
        
        // Préparer les champs à mettre à jour
        const fieldsToUpdate = [];
        const values = [];
        let paramIndex = 1;
        
        if (eloData.elo !== null && eloData.elo !== undefined) {
            fieldsToUpdate.push(`${isWinner ? 'winner_elo' : 'loser_elo'} = $${paramIndex++}`);
            values.push(eloData.elo);
        }
        
        if (eloData.elo_clay !== null && eloData.elo_clay !== undefined) {
            fieldsToUpdate.push(`${isWinner ? 'winner_elo_clay' : 'loser_elo_clay'} = $${paramIndex++}`);
            values.push(eloData.elo_clay);
        }
        
        if (eloData.elo_grass !== null && eloData.elo_grass !== undefined) {
            fieldsToUpdate.push(`${isWinner ? 'winner_elo_grass' : 'loser_elo_grass'} = $${paramIndex++}`);
            values.push(eloData.elo_grass);
        }
        
        if (eloData.elo_hard !== null && eloData.elo_hard !== undefined) {
            fieldsToUpdate.push(`${isWinner ? 'winner_elo_hard' : 'loser_elo_hard'} = $${paramIndex++}`);
            values.push(eloData.elo_hard);
        }
        
        if (eloData.elo_ihard !== null && eloData.elo_ihard !== undefined) {
            fieldsToUpdate.push(`${isWinner ? 'winner_elo_ihard' : 'loser_elo_ihard'} = $${paramIndex++}`);
            values.push(eloData.elo_ihard);
        }
        
        if (fieldsToUpdate.length === 0) {
            console.log(`     ⚠️  Aucune donnée ELO valide pour ${eloData.name}`);
            return;
        }
        
        // Exécuter la mise à jour
        values.push(match.id);
        const updateQuery = `
            UPDATE matches 
            SET ${fieldsToUpdate.join(', ')}
            WHERE id = $${paramIndex}
        `;
        
        await pgDB.query(updateQuery, values);
        
        console.log(`     ✅ ELO mis à jour pour match ID ${match.id} (${match.match_date})`);
        
    } catch (error) {
        console.error(`     ❌ Erreur mise à jour ELO joueur ${playerId}:`, error.message);
    }
}

// =============================================
// STATISTIQUES ET RAPPORTS
// =============================================

async function displayFinalStats() {
    console.log(`\n📊 RÉSUMÉ DE LA MISE À JOUR:`);
    console.log(`   - Joueurs mis à jour: ${updatedPlayers.length}`);
    console.log(`   - Joueurs non trouvés: ${notFoundPlayers.length}`);
    console.log(`   - Correspondances ambiguës: ${ambiguousPlayers.length}`);
    
    // Sauvegarder les rapports
    if (notFoundPlayers.length > 0) {
        console.log(`\n📝 JOUEURS NON TROUVÉS:`);
        notFoundPlayers.forEach((player, index) => {
            console.log(`   ${index + 1}. ${player.excelName} (${player.tour}) - ELO: ${player.elo}`);
        });
    }
    
    if (ambiguousPlayers.length > 0) {
        console.log(`\n❓ CORRESPONDANCES AMBIGUËS:`);
        ambiguousPlayers.forEach((player, index) => {
            console.log(`   ${index + 1}. ${player.excelName} (${player.tour}) - ELO: ${player.elo}`);
            console.log(`      Correspondances: ${player.matches.join(', ')}`);
        });
    }
    
    // Statistiques de la base
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_matches,
                COUNT(winner_elo) as matches_with_winner_elo,
                COUNT(loser_elo) as matches_with_loser_elo,
                AVG(CASE WHEN winner_elo IS NOT NULL THEN winner_elo END) as avg_winner_elo,
                AVG(CASE WHEN loser_elo IS NOT NULL THEN loser_elo END) as avg_loser_elo
            FROM matches
        `;
        
        const stats = await pgDB.query(statsQuery);
        const data = stats.rows[0];
        
        console.log(`\n📈 STATISTIQUES DE LA BASE:`);
        console.log(`   - Total matchs: ${data.total_matches}`);
        console.log(`   - Matchs avec ELO vainqueur: ${data.matches_with_winner_elo}`);
        console.log(`   - Matchs avec ELO perdant: ${data.matches_with_loser_elo}`);
        
        if (data.avg_winner_elo) {
            console.log(`   - ELO moyen vainqueur: ${Math.round(data.avg_winner_elo)}`);
            console.log(`   - ELO moyen perdant: ${Math.round(data.avg_loser_elo)}`);
        }
        
    } catch (error) {
        console.error('Erreur statistiques:', error.message);
    }
}

// =============================================
// UTILITAIRES BASE DE DONNÉES
// =============================================

async function connectDatabase() {
    console.log('📡 Connexion à PostgreSQL...');
    
    try {
        pgDB = new Client(pgConfig);
        await pgDB.connect();
        console.log('  ✅ Connexion PostgreSQL établie');
    } catch (error) {
        throw new Error(`Échec connexion PostgreSQL: ${error.message}`);
    }
}

async function closeDatabase() {
    if (pgDB) {
        try {
            await pgDB.end();
            console.log('📡 Connexion PostgreSQL fermée');
        } catch (error) {
            console.error('Erreur fermeture PostgreSQL:', error.message);
        }
    }
}

// =============================================
// POINT D'ENTRÉE
// =============================================

if (require.main === module) {
    updateEloFromExcel().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Erreur:', error.message);
        process.exit(1);
    });
}

module.exports = {
    updateEloFromExcel
};