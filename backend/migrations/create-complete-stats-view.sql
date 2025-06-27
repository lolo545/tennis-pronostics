-- =============================================
-- VUE DES STATISTIQUES COMPLÈTES DES JOUEURS
-- =============================================

-- Supprimer la vue si elle existe
DROP VIEW IF EXISTS v_player_complete_stats;

-- Créer la vue des statistiques complètes
CREATE VIEW v_player_complete_stats AS
WITH current_rankings AS (
    -- Récupérer le classement le plus récent pour chaque joueur
    SELECT DISTINCT ON (r.player_id)
        r.player_id,
        r.ranking_date,
        r.position as current_ranking,
        r.points as ranking_points
    FROM rankings r
    WHERE r.position IS NOT NULL
    ORDER BY r.player_id, r.ranking_date DESC
),
current_elo AS (
    -- Récupérer les ELO les plus récents pour chaque joueur
    SELECT DISTINCT ON (m.winner_id)
        m.winner_id as player_id,
        COALESCE(m.winner_elo, 1500) as elo_general,
        COALESCE(m.winner_elo_clay, 1500) as elo_clay,
        COALESCE(m.winner_elo_grass, 1500) as elo_grass,
        COALESCE(m.winner_elo_hard, 1500) as elo_hard,
        COALESCE(m.winner_elo_ihard, 1500) as elo_ihard
    FROM matches m
    WHERE m.winner_elo IS NOT NULL
    ORDER BY m.winner_id, m.match_date DESC
    
    UNION
    
    SELECT DISTINCT ON (m.loser_id)
        m.loser_id as player_id,
        COALESCE(m.loser_elo, 1500) as elo_general,
        COALESCE(m.loser_elo_clay, 1500) as elo_clay,
        COALESCE(m.loser_elo_grass, 1500) as elo_grass,
        COALESCE(m.loser_elo_hard, 1500) as elo_hard,
        COALESCE(m.loser_elo_ihard, 1500) as elo_ihard
    FROM matches m
    WHERE m.loser_elo IS NOT NULL
    ORDER BY m.loser_id, m.match_date DESC
),
betting_stats AS (
    -- Calculs des gains sur paris par période
    SELECT 
        player_id,
        tour,
        -- 3 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '3 months' AND winner_odds IS NOT NULL
            THEN CASE WHEN won = 1 THEN (winner_odds - 1) ELSE -1 END
            ELSE 0
        END) as betting_gains_3m,
        
        -- 6 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '6 months' AND winner_odds IS NOT NULL
            THEN CASE WHEN won = 1 THEN (winner_odds - 1) ELSE -1 END
            ELSE 0
        END) as betting_gains_6m,
        
        -- 12 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '12 months' AND winner_odds IS NOT NULL
            THEN CASE WHEN won = 1 THEN (winner_odds - 1) ELSE -1 END
            ELSE 0
        END) as betting_gains_12m,
        
        -- 24 mois
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '24 months' AND winner_odds IS NOT NULL
            THEN CASE WHEN won = 1 THEN (winner_odds - 1) ELSE -1 END
            ELSE 0
        END) as betting_gains_24m,
        
        -- 60 mois (5 ans)
        SUM(CASE 
            WHEN match_date >= CURRENT_DATE - INTERVAL '60 months' AND winner_odds IS NOT NULL
            THEN CASE WHEN won = 1 THEN (winner_odds - 1) ELSE -1 END
            ELSE 0
        END) as betting_gains_60m,
        
        -- Total
        SUM(CASE 
            WHEN winner_odds IS NOT NULL
            THEN CASE WHEN won = 1 THEN (winner_odds - 1) ELSE -1 END
            ELSE 0
        END) as betting_gains_total
        
    FROM (
        -- Matches en tant que winner
        SELECT 
            m.winner_id as player_id,
            p.tour,
            m.match_date,
            m.winner_odds,
            1 as won
        FROM matches m
        JOIN players p ON m.winner_id = p.id
        WHERE m.winner_odds IS NOT NULL
        
        UNION ALL
        
        -- Matches en tant que loser
        SELECT 
            m.loser_id as player_id,
            p.tour,
            m.match_date,
            m.loser_odds as winner_odds,
            0 as won
        FROM matches m
        JOIN players p ON m.loser_id = p.id
        WHERE m.loser_odds IS NOT NULL
    ) all_matches
    GROUP BY player_id, tour
)
SELECT 
    p.id as player_id,
    p.full_name,
    p.first_name,
    p.last_name,
    p.tour,
    c.code as country_code,
    
    -- Rankings
    cr.ranking_date,
    COALESCE(cr.current_ranking, 999) as current_ranking,
    cr.ranking_points,
    
    -- ELO ratings
    COALESCE(ce.elo_general, 1500) as elo_general,
    COALESCE(ce.elo_clay, 1500) as elo_clay,
    COALESCE(ce.elo_grass, 1500) as elo_grass,
    COALESCE(ce.elo_hard, 1500) as elo_hard,
    COALESCE(ce.elo_ihard, 1500) as elo_ihard,
    
    -- Betting gains
    COALESCE(bs.betting_gains_3m, 0) as betting_gains_3m,
    COALESCE(bs.betting_gains_6m, 0) as betting_gains_6m,
    COALESCE(bs.betting_gains_12m, 0) as betting_gains_12m,
    COALESCE(bs.betting_gains_24m, 0) as betting_gains_24m,
    COALESCE(bs.betting_gains_60m, 0) as betting_gains_60m,
    COALESCE(bs.betting_gains_total, 0) as betting_gains_total

FROM players p
LEFT JOIN countries c ON p.country_id = c.id
LEFT JOIN current_rankings cr ON p.id = cr.player_id
LEFT JOIN current_elo ce ON p.id = ce.player_id
LEFT JOIN betting_stats bs ON p.id = bs.player_id
WHERE cr.current_ranking IS NOT NULL
  AND cr.current_ranking <= 900
ORDER BY cr.current_ranking ASC;

-- Créer un index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_v_player_complete_stats_tour ON players(tour);
CREATE INDEX IF NOT EXISTS idx_v_player_complete_stats_rankings ON rankings(player_id, ranking_date DESC);
CREATE INDEX IF NOT EXISTS idx_v_player_complete_stats_matches_winner ON matches(winner_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_v_player_complete_stats_matches_loser ON matches(loser_id, match_date DESC);