const XLSX = require('xlsx');
const path = require('path');

async function analyzeEloExcelFiles() {
    console.log('\n🎾 ANALYSE DES FICHIERS EXCEL ELO');
    console.log('=================================');
    console.log(`⏰ Début: ${new Date().toLocaleString('fr-FR')}`);
    
    try {
        // Analyser le fichier hommes
        console.log('\n📊 ANALYSE FICHIER ELO HOMMES (ATP)');
        console.log('===================================');
        const menData = analyzeExcelFile('Elo_Man.xlsx', 'ATP');
        
        // Analyser le fichier femmes
        console.log('\n📊 ANALYSE FICHIER ELO FEMMES (WTA)');
        console.log('====================================');
        const womenData = analyzeExcelFile('Elo_Woman.xlsx', 'WTA');
        
        // Statistiques combinées
        console.log('\n📈 STATISTIQUES COMBINÉES');
        console.log('==========================');
        const totalPlayers = menData.totalPlayers + womenData.totalPlayers;
        console.log(`Total joueurs/joueuses: ${totalPlayers}`);
        console.log(`- ATP: ${menData.totalPlayers}`);
        console.log(`- WTA: ${womenData.totalPlayers}`);
        
        // Vérification joueur 5061 spécifiquement
        console.log('\n🔍 RECHERCHE JOUEUR ID 5061');
        console.log('============================');
        const player5061ATP = menData.players.find(p => p.id === 5061 || p.id === '5061');
        const player5061WTA = womenData.players.find(p => p.id === 5061 || p.id === '5061');
        
        if (player5061ATP) {
            console.log('✅ Joueur 5061 trouvé dans le fichier ATP:');
            console.log(`   Nom: ${player5061ATP.name || 'N/A'}`);
            console.log(`   ELO général: ${player5061ATP.elo_general || 'N/A'}`);
            console.log(`   ELO Clay: ${player5061ATP.elo_clay || 'N/A'}`);
            console.log(`   ELO Grass: ${player5061ATP.elo_grass || 'N/A'}`);
            console.log(`   ELO Hard: ${player5061ATP.elo_hard || 'N/A'}`);
            console.log(`   ELO Indoor Hard: ${player5061ATP.elo_ihard || 'N/A'}`);
        } else if (player5061WTA) {
            console.log('✅ Joueur 5061 trouvé dans le fichier WTA:');
            console.log(`   Nom: ${player5061WTA.name || 'N/A'}`);
            console.log(`   ELO général: ${player5061WTA.elo_general || 'N/A'}`);
            console.log(`   ELO Clay: ${player5061WTA.elo_clay || 'N/A'}`);
            console.log(`   ELO Grass: ${player5061WTA.elo_grass || 'N/A'}`);
            console.log(`   ELO Hard: ${player5061WTA.elo_hard || 'N/A'}`);
            console.log(`   ELO Indoor Hard: ${player5061WTA.elo_ihard || 'N/A'}`);
        } else {
            console.log('❌ Joueur 5061 NON trouvé dans les fichiers ELO');
            
            // Chercher des IDs proches
            console.log('\n🔍 Recherche d\'IDs proches de 5061:');
            const allPlayers = [...menData.players, ...womenData.players];
            const closeIds = allPlayers.filter(p => {
                const id = parseInt(p.id);
                return id >= 5050 && id <= 5070;
            }).sort((a, b) => parseInt(a.id) - parseInt(b.id));
            
            if (closeIds.length > 0) {
                console.log(`Trouvé ${closeIds.length} joueurs avec des IDs proches:`);
                closeIds.forEach(player => {
                    console.log(`   ID ${player.id}: ${player.name || 'N/A'} (${player.tour})`);
                });
            } else {
                console.log('Aucun ID proche trouvé');
            }
        }
        
        // Top 10 ELO général combiné
        console.log('\n🏆 TOP 10 ELO GÉNÉRAL (ATP + WTA)');
        console.log('==================================');
        const allPlayers = [...menData.players, ...womenData.players];
        const topPlayers = allPlayers
            .filter(p => p.elo_general && !isNaN(p.elo_general))
            .sort((a, b) => b.elo_general - a.elo_general)
            .slice(0, 10);
            
        topPlayers.forEach((player, index) => {
            console.log(`${index + 1}. ${player.name || 'N/A'} (${player.tour}): ${player.elo_general} ELO`);
        });
        
        console.log('\n✅ ANALYSE TERMINÉE');
        
    } catch (error) {
        console.error('❌ ERREUR GÉNÉRALE:', error.message);
        throw error;
    }
}

function analyzeExcelFile(filename, tour) {
    try {
        const filePath = path.join(__dirname, filename);
        console.log(`📂 Lecture de ${filename}...`);
        
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        console.log(`   Feuilles disponibles: ${sheetNames.join(', ')}`);
        
        // Prendre la première feuille
        const worksheet = workbook.Sheets[sheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        console.log(`   Total lignes: ${jsonData.length}`);
        
        if (jsonData.length === 0) {
            console.log('❌ Aucune donnée trouvée');
            return { totalPlayers: 0, players: [] };
        }
        
        // Analyser la structure des colonnes
        const firstRow = jsonData[0];
        const columns = Object.keys(firstRow);
        console.log(`   Colonnes détectées: ${columns.join(', ')}`);
        
        // Normaliser les données
        const players = jsonData.map(row => {
            const player = { tour: tour };
            
            // Essayer de détecter les colonnes importantes
            for (const [key, value] of Object.entries(row)) {
                const lowerKey = key.toLowerCase();
                
                if (lowerKey.includes('id') || lowerKey.includes('player_id')) {
                    player.id = value;
                } else if (lowerKey.includes('name') || lowerKey.includes('nom') || lowerKey.includes('player')) {
                    player.name = value;
                } else if (lowerKey.includes('elo') && !lowerKey.includes('clay') && !lowerKey.includes('grass') && !lowerKey.includes('hard')) {
                    player.elo_general = parseFloat(value);
                } else if (lowerKey.includes('clay') || lowerKey.includes('terre')) {
                    player.elo_clay = parseFloat(value);
                } else if (lowerKey.includes('grass') || lowerKey.includes('gazon')) {
                    player.elo_grass = parseFloat(value);
                } else if (lowerKey.includes('hard') && !lowerKey.includes('indoor')) {
                    player.elo_hard = parseFloat(value);
                } else if (lowerKey.includes('indoor') || lowerKey.includes('ihard')) {
                    player.elo_ihard = parseFloat(value);
                }
                
                // Garder la valeur originale aussi
                player[key] = value;
            }
            
            return player;
        });
        
        // Statistiques
        const playersWithElo = players.filter(p => p.elo_general && !isNaN(p.elo_general));
        const avgElo = playersWithElo.length > 0 ? 
            Math.round(playersWithElo.reduce((sum, p) => sum + p.elo_general, 0) / playersWithElo.length) : 0;
        const maxElo = playersWithElo.length > 0 ? Math.max(...playersWithElo.map(p => p.elo_general)) : 0;
        const minElo = playersWithElo.length > 0 ? Math.min(...playersWithElo.map(p => p.elo_general)) : 0;
        
        console.log(`   Joueurs avec ELO général: ${playersWithElo.length}/${players.length}`);
        console.log(`   ELO moyen: ${avgElo}`);
        console.log(`   ELO max: ${maxElo}`);
        console.log(`   ELO min: ${minElo}`);
        
        // Top 5 du fichier
        const top5 = playersWithElo
            .sort((a, b) => b.elo_general - a.elo_general)
            .slice(0, 5);
            
        console.log(`   Top 5:`);
        top5.forEach((player, index) => {
            console.log(`      ${index + 1}. ${player.name || 'N/A'}: ${player.elo_general}`);
        });
        
        return {
            totalPlayers: players.length,
            players: players,
            playersWithElo: playersWithElo.length,
            avgElo: avgElo,
            maxElo: maxElo,
            minElo: minElo
        };
        
    } catch (error) {
        console.error(`❌ Erreur lecture ${filename}:`, error.message);
        return { totalPlayers: 0, players: [] };
    }
}

// Exécuter l'analyse
analyzeEloExcelFiles().catch(console.error);