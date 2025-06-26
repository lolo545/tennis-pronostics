-- Vue complète des 900 joueurs classés avec ELO et gains sur paris par période
CREATE OR REPLACE VIEW v_player_complete_stats AS
WITH 
-- Récupérer la date du dernier classement pour chaque tour
latest_ranking_dates AS (
    SELECT 
        p.tour,
        MAX(pr.ranking_date) as latest_date
    FROM player_rankings pr
    JOIN players p ON pr.player_id = p.id
    GROUP BY p.tour
),

-- Classements actuels des 900 premiers joueurs de chaque tour
current_rankings AS (
    SELECT 
        pr.player_id,
        pr.ranking_date,
        pr.position,
        pr.points,
        p.tour,
        p.full_name,
        p.first_name,
        p.last_name,
        c.code as country_code
    FROM player_rankings pr
    JOIN players p ON pr.player_id = p.id
    LEFT JOIN countries c ON p.country_id = c.id
    JOIN latest_ranking_dates lrd ON p.tour = lrd.tour AND pr.ranking_date = lrd.latest_date
    WHERE pr.position <= 900
),

-- ELO les plus récents pour chaque joueur
latest_elo AS (
    WITH all_player_elos AS (
        SELECT 
            m.winner_id as player_id,
            m.match_date,
            m.winner_elo as elo_general,
            m.winner_elo_clay as elo_clay,
            m.winner_elo_grass as elo_grass,
            m.winner_elo_hard as elo_hard,
            m.winner_elo_ihard as elo_ihard
        FROM matches m
        WHERE m.winner_elo IS NOT NULL
        UNION ALL
        SELECT 
            m.loser_id as player_id,
            m.match_date,
            m.loser_elo as elo_general,
            m.loser_elo_clay as elo_clay,
            m.loser_elo_grass as elo_grass,
            m.loser_elo_hard as elo_hard,
            m.loser_elo_ihard as elo_ihard
        FROM matches m
        WHERE m.loser_elo IS NOT NULL
    )
    SELECT 
        player_id,
        elo_general,
        elo_clay,
        elo_grass,
        elo_hard,
        elo_ihard,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY match_date DESC) as rn
    FROM all_player_elos
),

-- Calcul des gains pour tous les matchs avec cotes
betting_gains AS (
    SELECT 
        player_id,
        -- Gains sur 3 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '3 months' 
            THEN CASE WHEN won = 1 THEN (odds_value - 1) ELSE -1 END 
            ELSE 0 
        END) as gains_3m,
        
        -- Gains sur 6 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '6 months' 
            THEN CASE WHEN won = 1 THEN (odds_value - 1) ELSE -1 END 
            ELSE 0 
        END) as gains_6m,
        
        -- Gains sur 12 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '12 months' 
            THEN CASE WHEN won = 1 THEN (odds_value - 1) ELSE -1 END 
            ELSE 0 
        END) as gains_12m,
        
        -- Gains sur 24 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '24 months' 
            THEN CASE WHEN won = 1 THEN (odds_value - 1) ELSE -1 END 
            ELSE 0 
        END) as gains_24m,
        
        -- Gains sur 60 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '60 months' 
            THEN CASE WHEN won = 1 THEN (odds_value - 1) ELSE -1 END 
            ELSE 0 
        END) as gains_60m,
        
        -- Gains totaux
        SUM(CASE WHEN won = 1 THEN (odds_value - 1) ELSE -1 END) as gains_total
        
    FROM (
        -- Matchs où le joueur est gagnant
        SELECT 
            m.winner_id as player_id,
            m.match_date,
            m.winner_odds as odds_value,
            1 as won,
            COALESCE(m.loser_ranking, 901) as opponent_ranking
        FROM matches m
        WHERE m.winner_odds IS NOT NULL 
        AND m.loser_odds IS NOT NULL
        
        UNION ALL
        
        -- Matchs où le joueur est perdant
        SELECT 
            m.loser_id as player_id,
            m.match_date,
            m.loser_odds as odds_value,
            0 as won,
            COALESCE(m.winner_ranking, 901) as opponent_ranking
        FROM matches m
        WHERE m.winner_odds IS NOT NULL 
        AND m.loser_odds IS NOT NULL
    ) all_bets
    GROUP BY player_id
)

-- Résultat final : assemblage de toutes les données
SELECT 
    cr.player_id,
    cr.full_name,
    cr.first_name,
    cr.last_name,
    cr.tour,
    cr.country_code,
    cr.ranking_date,
    cr.position as current_ranking,
    cr.points as ranking_points,
    
    -- ELO ratings
    COALESCE(le.elo_general, 1500) as elo_general,
    COALESCE(le.elo_clay, 1500) as elo_clay,
    COALESCE(le.elo_grass, 1500) as elo_grass,
    COALESCE(le.elo_hard, 1500) as elo_hard,
    COALESCE(le.elo_ihard, 1500) as elo_ihard,
    
    -- Gains sur paris par période (en unités de mise = 1€)
    ROUND(COALESCE(bg.gains_3m, 0)::numeric, 2) as betting_gains_3m,
    ROUND(COALESCE(bg.gains_6m, 0)::numeric, 2) as betting_gains_6m,
    ROUND(COALESCE(bg.gains_12m, 0)::numeric, 2) as betting_gains_12m,
    ROUND(COALESCE(bg.gains_24m, 0)::numeric, 2) as betting_gains_24m,
    ROUND(COALESCE(bg.gains_60m, 0)::numeric, 2) as betting_gains_60m,
    ROUND(COALESCE(bg.gains_total, 0)::numeric, 2) as betting_gains_total

FROM current_rankings cr
LEFT JOIN latest_elo le ON cr.player_id = le.player_id AND le.rn = 1
LEFT JOIN betting_gains bg ON cr.player_id = bg.player_id
ORDER BY cr.tour, cr.position;

-- Commentaire sur la vue
COMMENT ON VIEW v_player_complete_stats IS 'Vue complète des 900 premiers joueurs classés avec ELO actuels et gains sur paris par période. Les gains sont calculés en supposant une mise de 1€ par match. Si adversaire non classé, position = 901.';