-- =============================================
-- VUE POUR AFFICHER TOUS LES MATCHS D'UN JOUEUR
-- =============================================

-- Supprimer la vue si elle existe déjà
DROP VIEW IF EXISTS player_matches_detailed;

-- Créer la vue pour les matchs détaillés d'un joueur
CREATE VIEW player_matches_detailed AS
WITH player_matches AS (
    -- Matchs où le joueur a gagné
    SELECT 
        m.id as match_id,
        m.match_date,
        m.winner_id as player_id,
        m.loser_id as opponent_id,
        'Victoire' as result,
        m.score_raw,
        -- ELO du joueur (winner)
        m.winner_elo as player_elo_general,
        m.winner_elo_clay as player_elo_clay,
        m.winner_elo_grass as player_elo_grass,
        m.winner_elo_hard as player_elo_hard,
        m.winner_elo_ihard as player_elo_ihard,
        -- ELO de l'adversaire (loser)
        m.loser_elo as opponent_elo_general,
        m.loser_elo_clay as opponent_elo_clay,
        m.loser_elo_grass as opponent_elo_grass,
        m.loser_elo_hard as opponent_elo_hard,
        m.loser_elo_ihard as opponent_elo_ihard,
        -- Classements officiels
        m.winner_ranking as player_ranking,
        m.winner_points as player_points,
        m.loser_ranking as opponent_ranking,
        m.loser_points as opponent_points,
        -- Informations tournoi
        m.tournament_id,
        m.round_id
    FROM matches m
    
    UNION ALL
    
    -- Matchs où le joueur a perdu
    SELECT 
        m.id as match_id,
        m.match_date,
        m.loser_id as player_id,
        m.winner_id as opponent_id,
        'Défaite' as result,
        m.score_raw,
        -- ELO du joueur (loser)
        m.loser_elo as player_elo_general,
        m.loser_elo_clay as player_elo_clay,
        m.loser_elo_grass as player_elo_grass,
        m.loser_elo_hard as player_elo_hard,
        m.loser_elo_ihard as player_elo_ihard,
        -- ELO de l'adversaire (winner)
        m.winner_elo as opponent_elo_general,
        m.winner_elo_clay as opponent_elo_clay,
        m.winner_elo_grass as opponent_elo_grass,
        m.winner_elo_hard as opponent_elo_hard,
        m.winner_elo_ihard as opponent_elo_ihard,
        -- Classements officiels
        m.loser_ranking as player_ranking,
        m.loser_points as player_points,
        m.winner_ranking as opponent_ranking,
        m.winner_points as opponent_points,
        -- Informations tournoi
        m.tournament_id,
        m.round_id
    FROM matches m
)
-- Vue finale avec toutes les informations
SELECT 
    pm.match_id,
    pm.match_date,
    pm.player_id,
    
    -- Informations joueur
    p.full_name as player_name,
    p.tour as player_tour,
    pc.code as player_country,
    
    -- Informations adversaire
    pm.opponent_id,
    op.full_name as opponent_name,
    op.tour as opponent_tour,
    opc.code as opponent_country,
    
    -- Résultat du match
    pm.result,
    pm.score_raw as score,
    
    -- Classements officiels
    pm.player_ranking,
    pm.player_points,
    pm.opponent_ranking,
    pm.opponent_points,
    
    -- ELO général
    pm.player_elo_general,
    pm.opponent_elo_general,
    
    -- ELO par surface
    pm.player_elo_clay,
    pm.opponent_elo_clay,
    pm.player_elo_grass,
    pm.opponent_elo_grass,
    pm.player_elo_hard,
    pm.opponent_elo_hard,
    pm.player_elo_ihard,
    pm.opponent_elo_ihard,
    
    -- Informations tournoi
    t.name as tournament_name,
    t.start_date as tournament_date,
    cs.name as surface,
    tt.name as tournament_type,
    c.code as tournament_country,
    r.name as round_name,
    r.is_qualifying,
    
    -- Différence de classements
    CASE 
        WHEN pm.player_ranking IS NOT NULL AND pm.opponent_ranking IS NOT NULL 
        THEN pm.opponent_ranking - pm.player_ranking 
        ELSE NULL 
    END as ranking_difference,
    
    -- Différence d'ELO
    CASE 
        WHEN pm.player_elo_general IS NOT NULL AND pm.opponent_elo_general IS NOT NULL 
        THEN pm.player_elo_general - pm.opponent_elo_general
        ELSE NULL 
    END as elo_difference

FROM player_matches pm
LEFT JOIN players p ON pm.player_id = p.id
LEFT JOIN countries pc ON p.country_id = pc.id
LEFT JOIN players op ON pm.opponent_id = op.id
LEFT JOIN countries opc ON op.country_id = opc.id
LEFT JOIN tournaments t ON pm.tournament_id = t.id
LEFT JOIN court_surfaces cs ON t.court_surface_id = cs.id
LEFT JOIN type_tournoi tt ON t.type_tournoi_id = tt.id
LEFT JOIN countries c ON t.country_id = c.id
LEFT JOIN rounds r ON pm.round_id = r.id

-- Ordonner par date décroissante (plus récent en premier)
ORDER BY pm.match_date DESC, pm.match_id DESC;

-- Commentaire sur la vue
COMMENT ON VIEW player_matches_detailed IS 'Vue détaillée de tous les matchs pour chaque joueur avec classements et ELO';

-- =============================================
-- EXEMPLES D'UTILISATION
-- =============================================

-- Pour voir tous les matchs du joueur 5061 :
-- SELECT * FROM player_matches_detailed WHERE player_id = 5061;

-- Pour voir les 10 derniers matchs du joueur 5061 :
-- SELECT 
--     match_date,
--     opponent_name,
--     result,
--     score,
--     player_ranking,
--     opponent_ranking,
--     player_elo_general,
--     opponent_elo_general,
--     tournament_name,
--     surface
-- FROM player_matches_detailed 
-- WHERE player_id = 5061 
-- ORDER BY match_date DESC 
-- LIMIT 10;

-- Pour voir les victoires du joueur 5061 en 2024 :
-- SELECT 
--     match_date,
--     opponent_name,
--     score,
--     tournament_name
-- FROM player_matches_detailed 
-- WHERE player_id = 5061 
--   AND result = 'Victoire'
--   AND EXTRACT(YEAR FROM match_date::DATE) = 2024
-- ORDER BY match_date DESC;

-- Statistiques du joueur 5061 par surface :
-- SELECT 
--     surface,
--     COUNT(*) as total_matches,
--     COUNT(CASE WHEN result = 'Victoire' THEN 1 END) as wins,
--     COUNT(CASE WHEN result = 'Défaite' THEN 1 END) as losses,
--     ROUND(COUNT(CASE WHEN result = 'Victoire' THEN 1 END) * 100.0 / COUNT(*), 1) as win_percentage
-- FROM player_matches_detailed 
-- WHERE player_id = 5061
-- GROUP BY surface
-- ORDER BY total_matches DESC;