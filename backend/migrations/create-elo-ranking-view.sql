-- =============================================
-- CRÉATION D'UNE VUE POUR LE CLASSEMENT ELO ACTUEL
-- =============================================

-- Supprimer la vue si elle existe déjà
DROP VIEW IF EXISTS current_elo_rankings;

-- Créer la vue pour le classement ELO actuel
CREATE VIEW current_elo_rankings AS
WITH latest_winner_matches AS (
    -- Derniers matchs où le joueur a gagné
    SELECT DISTINCT ON (m.winner_id)
        m.winner_id as player_id,
        m.match_date,
        m.winner_elo as elo_general,
        m.winner_elo_clay as elo_clay,
        m.winner_elo_grass as elo_grass,
        m.winner_elo_hard as elo_hard,
        m.winner_elo_ihard as elo_ihard,
        m.id as match_id
    FROM matches m
    JOIN tournaments t ON m.tournament_id = t.id
    WHERE m.winner_elo IS NOT NULL
      AND t.type_tournoi_id != 7  -- Exclure les Futures
    ORDER BY m.winner_id, m.match_date DESC, m.id DESC
),
latest_loser_matches AS (
    -- Derniers matchs où le joueur a perdu
    SELECT DISTINCT ON (m.loser_id)
        m.loser_id as player_id,
        m.match_date,
        m.loser_elo as elo_general,
        m.loser_elo_clay as elo_clay,
        m.loser_elo_grass as elo_grass,
        m.loser_elo_hard as elo_hard,
        m.loser_elo_ihard as elo_ihard,
        m.id as match_id
    FROM matches m
    JOIN tournaments t ON m.tournament_id = t.id
    WHERE m.loser_elo IS NOT NULL
      AND t.type_tournoi_id != 7  -- Exclure les Futures
    ORDER BY m.loser_id, m.match_date DESC, m.id DESC
),
all_latest_matches AS (
    -- Combiner les derniers matchs (victoires et défaites)
    SELECT * FROM latest_winner_matches
    UNION ALL
    SELECT * FROM latest_loser_matches
),
latest_player_elo AS (
    -- Pour chaque joueur, prendre son match le plus récent
    SELECT DISTINCT ON (player_id)
        player_id,
        match_date,
        elo_general,
        elo_clay,
        elo_grass,
        elo_hard,
        elo_ihard,
        match_id
    FROM all_latest_matches
    ORDER BY player_id, match_date DESC, match_id DESC
),
player_activity_12m AS (
    -- Compter les matchs des 12 derniers mois pour chaque joueur
    SELECT 
        player_id,
        COUNT(*) as matches_12m
    FROM (
        -- Matchs comme vainqueur
        SELECT 
            m.winner_id as player_id,
            m.match_date
        FROM matches m
        JOIN tournaments t ON m.tournament_id = t.id
        WHERE m.match_date::DATE >= CURRENT_DATE - INTERVAL '12 months'
          AND t.type_tournoi_id != 7  -- Exclure les Futures
        
        UNION ALL
        
        -- Matchs comme perdant
        SELECT 
            m.loser_id as player_id,
            m.match_date
        FROM matches m
        JOIN tournaments t ON m.tournament_id = t.id
        WHERE m.match_date::DATE >= CURRENT_DATE - INTERVAL '12 months'
          AND t.type_tournoi_id != 7  -- Exclure les Futures
    ) all_matches_12m
    GROUP BY player_id
    HAVING COUNT(*) >= 10  -- Au moins 10 matchs
)
-- Vue finale avec informations complètes
SELECT 
    ROW_NUMBER() OVER (
        PARTITION BY p.tour 
        ORDER BY lpe.elo_general DESC NULLS LAST, p.full_name
    ) as rank_in_tour,
    ROW_NUMBER() OVER (
        ORDER BY lpe.elo_general DESC NULLS LAST, p.full_name
    ) as overall_rank,
    
    -- Informations joueur
    p.id as player_id,
    p.full_name as player_name,
    p.first_name,
    p.last_name,
    p.tour,
    c.code as country_code,
    
    -- ELO actuel
    lpe.elo_general,
    lpe.elo_clay,
    lpe.elo_grass,
    lpe.elo_hard,
    lpe.elo_ihard,
    
    -- Informations du dernier match
    lpe.match_date as last_match_date,
    lpe.match_id as last_match_id,
    
    -- Calcul des jours depuis le dernier match
    CASE 
        WHEN lpe.match_date IS NOT NULL 
        THEN (CURRENT_DATE - lpe.match_date::DATE)::INTEGER
        ELSE NULL 
    END as days_since_last_match,
    
    -- Classification de l'activité
    CASE 
        WHEN lpe.match_date IS NULL THEN 'Aucun match'
        WHEN lpe.match_date::DATE >= CURRENT_DATE - INTERVAL '1 month' THEN 'Actif'
        WHEN lpe.match_date::DATE >= CURRENT_DATE - INTERVAL '3 months' THEN 'Peu actif'
        WHEN lpe.match_date::DATE >= CURRENT_DATE - INTERVAL '6 months' THEN 'Inactif'
        ELSE 'Très inactif'
    END as activity_status,
    
    -- Classement ATP/WTA actuel (si disponible)
    r.position as official_ranking,
    r.points as official_points,
    r.ranking_date as official_ranking_date,
    
    -- Nombre de matchs sur 12 mois
    pa.matches_12m

FROM players p
LEFT JOIN latest_player_elo lpe ON p.id = lpe.player_id
LEFT JOIN countries c ON p.country_id = c.id
LEFT JOIN (
    -- Dernier classement officiel de chaque joueur
    SELECT DISTINCT ON (player_id)
        player_id,
        position,
        points,
        ranking_date
    FROM player_rankings
    ORDER BY player_id, ranking_date DESC
) r ON p.id = r.player_id
INNER JOIN player_activity_12m pa ON p.id = pa.player_id

-- Filtrer uniquement les joueurs qui ont au moins un ELO et l'activité requise
WHERE lpe.elo_general IS NOT NULL

-- Ordonner par ELO général décroissant
ORDER BY lpe.elo_general DESC NULLS LAST, p.full_name;

-- Commentaire sur la vue
COMMENT ON VIEW current_elo_rankings IS 'Vue du classement ELO actuel des joueurs actifs (min 10 matchs en 12 mois, hors Futures)';

-- Créer des index pour optimiser les performances si nécessaire
-- (Les index sur les tables sous-jacentes devraient suffire)

-- Statistiques sur la vue (utile pour le monitoring)
-- SELECT 
--     tour,
--     COUNT(*) as total_players,
--     AVG(elo_general) as avg_elo,
--     MIN(elo_general) as min_elo,
--     MAX(elo_general) as max_elo,
--     COUNT(CASE WHEN activity_status = 'Actif' THEN 1 END) as active_players
-- FROM current_elo_rankings 
-- GROUP BY tour 
-- ORDER BY tour;