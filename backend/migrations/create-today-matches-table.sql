-- =============================================
-- TABLE TODAY_MATCHES - MATCHS DU JOUR
-- =============================================

-- Création de la table today_matches
CREATE TABLE IF NOT EXISTS today_matches (
    id SERIAL PRIMARY KEY,
    
    -- Références aux entités PostgreSQL (après mapping)
    tour VARCHAR(3) NOT NULL CHECK (tour IN ('ATP', 'WTA')),
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player1_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    player2_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    
    -- Date et heure du match
    match_datetime TIMESTAMP NOT NULL,
    
    -- Références originales Access (pour tracking et synchronisation)
    access_tour_id INTEGER NOT NULL, -- TOUR depuis today_atp/today_wta
    access_player1_id INTEGER NOT NULL, -- ID1 depuis today_atp/today_wta  
    access_player2_id INTEGER NOT NULL, -- ID2 depuis today_atp/today_wta
    access_round_id INTEGER NOT NULL, -- ROUND depuis today_atp/today_wta
    
    -- Métadonnées de synchronisation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Contrainte d'unicité pour éviter les doublons
    -- Basée sur les données Access pour garantir l'unicité
    UNIQUE (tour, access_tour_id, access_player1_id, access_player2_id, access_round_id, match_datetime)
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_today_matches_tour ON today_matches (tour);
CREATE INDEX IF NOT EXISTS idx_today_matches_tournament ON today_matches (tournament_id);
CREATE INDEX IF NOT EXISTS idx_today_matches_datetime ON today_matches (match_datetime);
CREATE INDEX IF NOT EXISTS idx_today_matches_players ON today_matches (player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_today_matches_round ON today_matches (round_id);
CREATE INDEX IF NOT EXISTS idx_today_matches_sync ON today_matches (last_sync);

-- Index composé pour les requêtes de synchronisation
CREATE INDEX IF NOT EXISTS idx_today_matches_access_ref ON today_matches (
    tour, access_tour_id, access_player1_id, access_player2_id, access_round_id
);

-- Fonction de mise à jour automatique du timestamp
CREATE OR REPLACE FUNCTION update_today_matches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mise à jour automatique
DROP TRIGGER IF EXISTS trigger_today_matches_updated_at ON today_matches;
CREATE TRIGGER trigger_today_matches_updated_at
    BEFORE UPDATE ON today_matches
    FOR EACH ROW
    EXECUTE FUNCTION update_today_matches_updated_at();

-- Commentaires pour documentation
COMMENT ON TABLE today_matches IS 'Table des matchs du jour synchronisée depuis Access (today_atp/today_wta)';
COMMENT ON COLUMN today_matches.tour IS 'Tour ATP ou WTA';
COMMENT ON COLUMN today_matches.tournament_id IS 'Référence au tournoi dans PostgreSQL';
COMMENT ON COLUMN today_matches.player1_id IS 'Premier joueur (référence PostgreSQL)';
COMMENT ON COLUMN today_matches.player2_id IS 'Deuxième joueur (référence PostgreSQL)';
COMMENT ON COLUMN today_matches.round_id IS 'Round du match (référence PostgreSQL)';
COMMENT ON COLUMN today_matches.match_datetime IS 'Date et heure du match';
COMMENT ON COLUMN today_matches.access_tour_id IS 'ID tournoi original depuis Access (TOUR)';
COMMENT ON COLUMN today_matches.access_player1_id IS 'ID joueur 1 original depuis Access (ID1)';
COMMENT ON COLUMN today_matches.access_player2_id IS 'ID joueur 2 original depuis Access (ID2)';
COMMENT ON COLUMN today_matches.access_round_id IS 'ID round original depuis Access (ROUND)';
COMMENT ON COLUMN today_matches.last_sync IS 'Dernière synchronisation depuis Access';