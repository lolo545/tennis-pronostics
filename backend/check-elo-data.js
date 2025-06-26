const { Client } = require('pg');
require('dotenv').config();

async function checkEloData() {
    const client = new Client({
        host: process.env.PG_HOST || 'localhost',
        port: process.env.PG_PORT || 5432,
        database: process.env.PG_DATABASE || 'tennis_pronostics',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD,
    });
    
    console.log(`Tentative de connexion à ${client.host}:${client.port}/${client.database} avec l'utilisateur ${client.user}`);

    try {
        await client.connect();
        console.log('✅ Connexion à PostgreSQL établie');

        // 1. Vérifier la structure de la table matches
        console.log('\n=== STRUCTURE DE LA TABLE MATCHES ===');
        const tableStructure = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'matches' 
            AND column_name ILIKE '%elo%'
            ORDER BY column_name;
        `);
        
        if (tableStructure.rows.length > 0) {
            console.log('Colonnes ELO trouvées :');
            tableStructure.rows.forEach(row => {
                console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
            });
        } else {
            console.log('❌ Aucune colonne ELO trouvée dans la table matches');
        }

        // 2. Compter le nombre total de matchs
        const totalMatches = await client.query('SELECT COUNT(*) as total FROM matches');
        console.log(`\n=== STATISTIQUES GÉNÉRALES ===`);
        console.log(`Nombre total de matchs: ${totalMatches.rows[0].total}`);

        // 3. Si des colonnes ELO existent, compter les valeurs non-nulles
        if (tableStructure.rows.length > 0) {
            console.log('\n=== STATISTIQUES ELO ===');
            
            for (const column of tableStructure.rows) {
                const colName = column.column_name;
                const nonNullCount = await client.query(`
                    SELECT COUNT(*) as count 
                    FROM matches 
                    WHERE ${colName} IS NOT NULL
                `);
                console.log(`${colName}: ${nonNullCount.rows[0].count} valeurs non-nulles`);
            }

            // 4. Montrer un échantillon de données ELO
            console.log('\n=== ÉCHANTILLON DE DONNÉES ELO ===');
            const eloColumns = tableStructure.rows.map(row => row.column_name).join(', ');
            const sampleQuery = `
                SELECT match_id, player1_id, player2_id, match_date, ${eloColumns}
                FROM matches 
                WHERE ${tableStructure.rows.map(row => `${row.column_name} IS NOT NULL`).join(' OR ')}
                ORDER BY match_date DESC 
                LIMIT 10
            `;
            
            const sampleData = await client.query(sampleQuery);
            if (sampleData.rows.length > 0) {
                console.log('Derniers matchs avec données ELO :');
                sampleData.rows.forEach((row, index) => {
                    console.log(`${index + 1}. Match ${row.match_id} (${row.match_date?.toISOString()?.split('T')[0] || 'N/A'})`);
                    console.log(`   Player1: ${row.player1_id}, Player2: ${row.player2_id}`);
                    tableStructure.rows.forEach(col => {
                        const colName = col.column_name;
                        if (row[colName] !== null) {
                            console.log(`   ${colName}: ${row[colName]}`);
                        }
                    });
                    console.log('');
                });
            } else {
                console.log('❌ Aucun match avec des données ELO trouvé');
            }

            // 5. Vérifier spécifiquement pour le joueur 5061
            console.log('\n=== DONNÉES ELO POUR LE JOUEUR 5061 ===');
            const player5061Query = `
                SELECT match_id, match_date, 
                       CASE WHEN player1_id = 5061 THEN 'Player1' ELSE 'Player2' END as player_role,
                       ${eloColumns}
                FROM matches 
                WHERE (player1_id = 5061 OR player2_id = 5061)
                  AND (${tableStructure.rows.map(row => `${row.column_name} IS NOT NULL`).join(' OR ')})
                ORDER BY match_date DESC 
                LIMIT 20
            `;
            
            const player5061Data = await client.query(player5061Query);
            if (player5061Data.rows.length > 0) {
                console.log(`Trouvé ${player5061Data.rows.length} matchs avec données ELO pour le joueur 5061 :`);
                player5061Data.rows.forEach((row, index) => {
                    console.log(`${index + 1}. Match ${row.match_id} (${row.match_date?.toISOString()?.split('T')[0] || 'N/A'}) - Rôle: ${row.player_role}`);
                    tableStructure.rows.forEach(col => {
                        const colName = col.column_name;
                        if (row[colName] !== null) {
                            console.log(`   ${colName}: ${row[colName]}`);
                        }
                    });
                });
            } else {
                console.log('❌ Aucun match avec données ELO trouvé pour le joueur 5061');
                
                // Vérifier si le joueur 5061 existe dans la base
                const playerExists = await client.query(`
                    SELECT COUNT(*) as count 
                    FROM matches 
                    WHERE player1_id = 5061 OR player2_id = 5061
                `);
                console.log(`Le joueur 5061 a ${playerExists.rows[0].count} matchs au total dans la base`);
            }

        } else {
            // Si pas de colonnes ELO, vérifier quand même le joueur 5061
            console.log('\n=== VÉRIFICATION JOUEUR 5061 (sans ELO) ===');
            const player5061Matches = await client.query(`
                SELECT COUNT(*) as count 
                FROM matches 
                WHERE player1_id = 5061 OR player2_id = 5061
            `);
            console.log(`Le joueur 5061 a ${player5061Matches.rows[0].count} matchs dans la base de données`);
        }

    } catch (error) {
        console.error('❌ Erreur lors de la vérification:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Connexion fermée');
    }
}

checkEloData().catch(console.error);