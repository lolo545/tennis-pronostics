-- =============================================
-- SCHÉMA POSTGRESQL COMPLET - TENNIS PRONOSTICS
-- =============================================

-- 1. TABLES DE RÉFÉRENCE (pas de dépendances)
-- =============================================

-- Table des pays
CREATE TABLE countries (
    id SERIAL PRIMARY KEY,
    code CHAR(3) UNIQUE NOT NULL, -- Code ISO 3166-1 alpha-3
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des surfaces de court
CREATE TABLE court_surfaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- 'Clay', 'Hard', 'Grass', 'Carpet', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les surfaces
CREATE INDEX idx_court_surfaces_name ON court_surfaces (name);

-- Table des types de tournois
CREATE TABLE type_tournoi (
    id SERIAL PRIMARY KEY,
    id_r INTEGER UNIQUE NOT NULL, -- RANK_T depuis Access
    nom VARCHAR(63) NOT NULL, -- Nom en français
    name VARCHAR(63) NOT NULL, -- Nom en anglais
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des tiers de tournois (sera remplie dynamiquement)
CREATE TABLE tier_tournoi (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, -- Valeur brute depuis TIER_T
    description VARCHAR(255), -- Description optionnelle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des tours/rounds
CREATE TABLE rounds (
    id SERIAL PRIMARY KEY,
    atp_id INTEGER UNIQUE NOT NULL, -- ID_R depuis Access
    name VARCHAR(50) NOT NULL, -- NAME_R
    is_qualifying BOOLEAN DEFAULT FALSE, -- TRUE pour les tours de qualif
    display_order INTEGER, -- Pour ordonner logiquement
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les rounds
CREATE INDEX idx_rounds_atp_id ON rounds (atp_id);

CREATE INDEX idx_rounds_display_order ON rounds (display_order);

CREATE INDEX idx_rounds_is_qualifying ON rounds (is_qualifying);

-- =============================================
-- 2. TABLES AVEC DÉPENDANCES SIMPLES
-- =============================================

-- Table des joueurs (unifiée ATP/WTA)
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    atp_id INTEGER, -- NULL pour WTA
    wta_id INTEGER, -- NULL pour ATP  
    tour VARCHAR(3) NOT NULL, -- 'ATP' ou 'WTA'
    full_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    birth_date DATE,
    country_id INTEGER REFERENCES countries (id),
    -- Champs physiques
    height_cm INTEGER, -- Taille en cm
    -- Champs de jeu (séparés depuis PLAYS)
    hand VARCHAR(80), -- 'Right-Handed', 'Left-Handed', 'Ambidextrous'
    backhand VARCHAR(50), -- 'One-Handed Backhand', 'Two-Handed Backhand'
    -- Liens et réseaux sociaux
    website_url TEXT,
    atp_page_url TEXT,
    twitter_handle VARCHAR(80),
    instagram_handle VARCHAR(80),
    facebook_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Contraintes pour éviter les doublons
    UNIQUE (atp_id, tour),
    UNIQUE (wta_id, tour),
    CHECK (tour IN ('ATP', 'WTA')),
    CHECK (
        (
            tour = 'ATP'
            AND atp_id IS NOT NULL
            AND wta_id IS NULL
        )
        OR (
            tour = 'WTA'
            AND wta_id IS NOT NULL
            AND atp_id IS NULL
        )
    )
);

-- Index pour les joueurs
CREATE INDEX idx_players_country_id ON players (country_id);

CREATE INDEX idx_players_birth_date ON players (birth_date);

CREATE INDEX idx_players_atp_id ON players (atp_id);

CREATE INDEX idx_players_wta_id ON players (wta_id);

CREATE INDEX idx_players_tour ON players (tour);

CREATE INDEX idx_players_hand ON players (hand);

CREATE INDEX idx_players_height ON players (height_cm);

-- Table des tournois (unifiée ATP/WTA)
CREATE TABLE tournaments (
    id SERIAL PRIMARY KEY,
    atp_id INTEGER, -- NULL pour WTA
    wta_id INTEGER, -- NULL pour ATP
    tour VARCHAR(3) NOT NULL, -- 'ATP' ou 'WTA'
    name VARCHAR(255) NOT NULL, -- NAME_T
    court_surface_id INTEGER REFERENCES court_surfaces (id),
    start_date DATE, -- DATE_T
    type_tournoi_id INTEGER REFERENCES type_tournoi (id), -- RANK_T
    country_id INTEGER REFERENCES countries (id), -- COUNTRY_T
    prize_money_raw VARCHAR(20), -- PRIZE_T brut ('$15K', '€145K')
    prize_amount DECIMAL(15, 2), -- Montant converti en EUR ou USD
    prize_currency CHAR(3), -- 'USD', 'EUR'
    tier_tournoi_id INTEGER REFERENCES tier_tournoi (id), -- TIER_T
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Contraintes
    CHECK (tour IN ('ATP', 'WTA')),
    CHECK (
        (
            tour = 'ATP'
            AND atp_id IS NOT NULL
            AND wta_id IS NULL
        )
        OR (
            tour = 'WTA'
            AND wta_id IS NOT NULL
            AND atp_id IS NULL
        )
    )
);

-- Index pour les tournois
CREATE INDEX idx_tournaments_start_date ON tournaments (start_date);

CREATE INDEX idx_tournaments_country_id ON tournaments (country_id);

CREATE INDEX idx_tournaments_court_surface_id ON tournaments (court_surface_id);

CREATE INDEX idx_tournaments_type_tournoi_id ON tournaments (type_tournoi_id);

CREATE INDEX idx_tournaments_tier_tournoi_id ON tournaments (tier_tournoi_id);

CREATE INDEX idx_tournaments_atp_id ON tournaments (atp_id);

CREATE INDEX idx_tournaments_wta_id ON tournaments (wta_id);

CREATE INDEX idx_tournaments_tour ON tournaments (tour);

-- =============================================
-- 3. TABLES AVEC DÉPENDANCES MULTIPLES
-- =============================================

-- Table des matchs (unifiée ATP/WTA)
CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    tour VARCHAR(3) NOT NULL, -- 'ATP' ou 'WTA'
    winner_id INTEGER NOT NULL REFERENCES players (id),
    loser_id INTEGER NOT NULL REFERENCES players (id),
    tournament_id INTEGER NOT NULL REFERENCES tournaments (id),
    round_id INTEGER NOT NULL REFERENCES rounds (id),
    score_raw VARCHAR(255), -- RESULT_G brut
    match_date DATE, -- DATE_G
    -- Statistiques par sets
    sets_winner INTEGER, -- Sets gagnés par le vainqueur
    sets_loser INTEGER, -- Sets gagnés par le perdant
    total_sets INTEGER, -- Total de sets
    -- Statistiques par jeux
    games_winner INTEGER, -- Jeux gagnés par le vainqueur
    games_loser INTEGER, -- Jeux gagnés par le perdant
    total_games INTEGER, -- Total de jeux
    -- Informations complémentaires
    has_tiebreak BOOLEAN DEFAULT FALSE,
    tiebreaks_count INTEGER DEFAULT 0, -- Nombre de tie-breaks
    is_walkover BOOLEAN DEFAULT FALSE,
    -- Classements et points à la date du match
    winner_ranking INTEGER, -- Classement du vainqueur
    winner_points INTEGER, -- Points du vainqueur
    loser_ranking INTEGER, -- Classement du perdant
    loser_points INTEGER, -- Points du perdant
    -- Cotes des bookmakers
    winner_odds DECIMAL(10, 3), -- Cote du vainqueur (3 décimales)
    loser_odds DECIMAL(10, 3), -- Cote du perdant (3 décimales)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Contraintes
    CHECK (tour IN ('ATP', 'WTA'))
);

-- Index pour les matchs
CREATE INDEX idx_matches_winner_id ON matches (winner_id);

CREATE INDEX idx_matches_loser_id ON matches (loser_id);

CREATE INDEX idx_matches_tournament_id ON matches (tournament_id);

CREATE INDEX idx_matches_round_id ON matches (round_id);

CREATE INDEX idx_matches_date ON matches (match_date);

CREATE INDEX idx_matches_tour ON matches (tour);

CREATE INDEX idx_matches_winner_tournament ON matches (winner_id, tournament_id);

CREATE INDEX idx_matches_loser_tournament ON matches (loser_id, tournament_id);

-- Table des classements des joueurs
CREATE TABLE player_rankings (
    id SERIAL PRIMARY KEY,
    ranking_date DATE NOT NULL,
    player_id INTEGER NOT NULL REFERENCES players (id), -- ID_P_R
    points INTEGER, -- POINT_R
    position INTEGER, -- POS_R
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Contrainte pour éviter les doublons
    UNIQUE (player_id, ranking_date)
);

-- Index pour les classements
CREATE INDEX idx_rankings_date ON player_rankings (ranking_date);

CREATE INDEX idx_rankings_player_id ON player_rankings (player_id);

CREATE INDEX idx_rankings_position ON player_rankings (position);

CREATE INDEX idx_rankings_player_date ON player_rankings (player_id, ranking_date);

-- Table du statut des joueurs dans les tournois (têtes de série, wildcards, etc.)
CREATE TABLE player_tournament_status (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players (id), -- ID_P_S
    tournament_id INTEGER NOT NULL REFERENCES tournaments (id), -- ID_T_S
    seeding_raw VARCHAR(10), -- SEEDING brut
    -- Champs parsés pour faciliter les analyses
    seed_number INTEGER, -- Numéro de série (ex: 6 dans "6WC")
    is_seeded BOOLEAN DEFAULT FALSE, -- A un numéro de série
    is_wildcard BOOLEAN DEFAULT FALSE, -- WC
    is_qualifier BOOLEAN DEFAULT FALSE, -- Q
    is_lucky_loser BOOLEAN DEFAULT FALSE, -- LL
    is_protected_ranking BOOLEAN DEFAULT FALSE, -- PR
    is_special_exempt BOOLEAN DEFAULT FALSE, -- SE
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Contrainte unique
    UNIQUE (player_id, tournament_id)
);

-- Index pour les statuts de tournoi
CREATE INDEX idx_tournament_status_player ON player_tournament_status (player_id);

CREATE INDEX idx_tournament_status_tournament ON player_tournament_status (tournament_id);

CREATE INDEX idx_tournament_status_seeded ON player_tournament_status (is_seeded);

CREATE INDEX idx_tournament_status_wildcard ON player_tournament_status (is_wildcard);

CREATE INDEX idx_tournament_status_qualifier ON player_tournament_status (is_qualifier);

-- =============================================
-- 4. DONNÉES DE RÉFÉRENCE INITIALES
-- =============================================

-- =============================================
-- 5. COMMENTAIRES SUR LES TABLES
-- =============================================

COMMENT ON
TABLE countries IS 'Table des pays avec codes ISO 3166-1 alpha-3';

COMMENT ON
TABLE court_surfaces IS 'Types de surfaces de court (Clay, Hard, Grass, etc.)';

COMMENT ON
TABLE type_tournoi IS 'Types de tournois (Grand Slam, Masters 1000, ATP 500, etc.)';

COMMENT ON
TABLE tier_tournoi IS 'Tiers de tournois (rempli dynamiquement depuis Access)';

COMMENT ON
TABLE rounds IS 'Tours dans un tournoi (Finale, Demi-finale, etc.)';

COMMENT ON
TABLE players IS 'Joueurs ATP et WTA avec informations personnelles et sportives';

COMMENT ON
TABLE tournaments IS 'Tournois ATP et WTA avec détails (lieu, prize money, etc.)';

COMMENT ON
TABLE matches IS 'Matchs avec scores détaillés, classements et cotes';

COMMENT ON
TABLE player_rankings IS 'Historique des classements des joueurs';

COMMENT ON
TABLE player_tournament_status IS 'Statut des joueurs dans les tournois (têtes de série, wildcards, etc.)';

-- =============================================
-- 6. VUES UTILES POUR LES ANALYSES
-- =============================================

-- Vue pour les matchs avec noms des joueurs et tournois
CREATE VIEW v_matches_detailed AS
SELECT
    m.*,
    w.full_name as winner_name,
    l.full_name as loser_name,
    t.name as tournament_name,
    r.name as round_name,
    cs.name as surface_name,
    c.code as country_code
FROM
    matches m
    JOIN players w ON m.winner_id = w.id
    JOIN players l ON m.loser_id = l.id
    JOIN tournaments t ON m.tournament_id = t.id
    JOIN rounds r ON m.round_id = r.id
    JOIN court_surfaces cs ON t.court_surface_id = cs.id
    JOIN countries c ON t.country_id = c.id;

-- Vue pour les head-to-head entre joueurs
CREATE VIEW v_head_to_head AS
SELECT
    LEAST(m.winner_id, m.loser_id) as player1_id,
    GREATEST(m.winner_id, m.loser_id) as player2_id,
    COUNT(*) as total_matches,
    SUM(
        CASE
            WHEN m.winner_id = LEAST(m.winner_id, m.loser_id) THEN 1
            ELSE 0
        END
    ) as player1_wins,
    SUM(
        CASE
            WHEN m.winner_id = GREATEST(m.winner_id, m.loser_id) THEN 1
            ELSE 0
        END
    ) as player2_wins
FROM matches m
GROUP BY
    LEAST(m.winner_id, m.loser_id),
    GREATEST(m.winner_id, m.loser_id);

COMMENT ON VIEW v_matches_detailed IS 'Vue détaillée des matchs avec tous les noms lisibles';

COMMENT ON VIEW v_head_to_head IS 'Statistiques head-to-head entre tous les joueurs';