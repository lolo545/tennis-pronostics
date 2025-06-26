--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4
-- Dumped by pg_dump version 16.0

-- Started on 2025-06-26 18:45:41

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 16384)
-- Name: adminpack; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS adminpack WITH SCHEMA pg_catalog;


--
-- TOC entry 5022 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION adminpack; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION adminpack IS 'administrative functions for PostgreSQL';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 217 (class 1259 OID 27446)
-- Name: countries; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.countries (
    id integer NOT NULL,
    code character(3) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.countries OWNER TO laurent;

--
-- TOC entry 5023 (class 0 OID 0)
-- Dependencies: 217
-- Name: TABLE countries; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.countries IS 'Table des pays avec codes ISO 3166-1 alpha-3';


--
-- TOC entry 216 (class 1259 OID 27445)
-- Name: countries_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.countries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.countries_id_seq OWNER TO laurent;

--
-- TOC entry 5024 (class 0 OID 0)
-- Dependencies: 216
-- Name: countries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.countries_id_seq OWNED BY public.countries.id;


--
-- TOC entry 219 (class 1259 OID 27456)
-- Name: court_surfaces; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.court_surfaces (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.court_surfaces OWNER TO laurent;

--
-- TOC entry 5025 (class 0 OID 0)
-- Dependencies: 219
-- Name: TABLE court_surfaces; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.court_surfaces IS 'Types de surfaces de court (Clay, Hard, Grass, etc.)';


--
-- TOC entry 218 (class 1259 OID 27455)
-- Name: court_surfaces_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.court_surfaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.court_surfaces_id_seq OWNER TO laurent;

--
-- TOC entry 5026 (class 0 OID 0)
-- Dependencies: 218
-- Name: court_surfaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.court_surfaces_id_seq OWNED BY public.court_surfaces.id;


--
-- TOC entry 231 (class 1259 OID 27569)
-- Name: matches; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.matches (
    id integer NOT NULL,
    tour character varying(3) NOT NULL,
    winner_id integer NOT NULL,
    loser_id integer NOT NULL,
    tournament_id integer NOT NULL,
    round_id integer NOT NULL,
    score_raw character varying(255),
    match_date date,
    sets_winner integer,
    sets_loser integer,
    total_sets integer,
    games_winner integer,
    games_loser integer,
    total_games integer,
    has_tiebreak boolean DEFAULT false,
    tiebreaks_count integer DEFAULT 0,
    is_walkover boolean DEFAULT false,
    winner_ranking integer,
    winner_points integer,
    loser_ranking integer,
    loser_points integer,
    winner_odds numeric(10,3),
    loser_odds numeric(10,3),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    winner_elo integer,
    winner_elo_clay integer,
    winner_elo_grass integer,
    winner_elo_hard integer,
    winner_elo_ihard integer,
    loser_elo integer,
    loser_elo_clay integer,
    loser_elo_grass integer,
    loser_elo_hard integer,
    loser_elo_ihard integer,
    CONSTRAINT matches_tour_check CHECK (((tour)::text = ANY ((ARRAY['ATP'::character varying, 'WTA'::character varying])::text[])))
);


ALTER TABLE public.matches OWNER TO laurent;

--
-- TOC entry 5027 (class 0 OID 0)
-- Dependencies: 231
-- Name: TABLE matches; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.matches IS 'Matchs avec scores détaillés, classements et cotes';


--
-- TOC entry 5028 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.winner_elo; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.winner_elo IS 'ELO général du vainqueur au moment du match';


--
-- TOC entry 5029 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.winner_elo_clay; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.winner_elo_clay IS 'ELO sur terre battue du vainqueur';


--
-- TOC entry 5030 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.winner_elo_grass; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.winner_elo_grass IS 'ELO sur gazon du vainqueur';


--
-- TOC entry 5031 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.winner_elo_hard; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.winner_elo_hard IS 'ELO sur dur extérieur du vainqueur';


--
-- TOC entry 5032 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.winner_elo_ihard; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.winner_elo_ihard IS 'ELO sur dur intérieur du vainqueur';


--
-- TOC entry 5033 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.loser_elo; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.loser_elo IS 'ELO général du perdant au moment du match';


--
-- TOC entry 5034 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.loser_elo_clay; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.loser_elo_clay IS 'ELO sur terre battue du perdant';


--
-- TOC entry 5035 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.loser_elo_grass; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.loser_elo_grass IS 'ELO sur gazon du perdant';


--
-- TOC entry 5036 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.loser_elo_hard; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.loser_elo_hard IS 'ELO sur dur extérieur du perdant';


--
-- TOC entry 5037 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN matches.loser_elo_ihard; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON COLUMN public.matches.loser_elo_ihard IS 'ELO sur dur intérieur du perdant';


--
-- TOC entry 233 (class 1259 OID 27610)
-- Name: player_rankings; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.player_rankings (
    id integer NOT NULL,
    ranking_date date NOT NULL,
    player_id integer NOT NULL,
    points integer,
    "position" integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.player_rankings OWNER TO laurent;

--
-- TOC entry 5038 (class 0 OID 0)
-- Dependencies: 233
-- Name: TABLE player_rankings; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.player_rankings IS 'Historique des classements des joueurs';


--
-- TOC entry 227 (class 1259 OID 27501)
-- Name: players; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.players (
    id integer NOT NULL,
    atp_id integer,
    wta_id integer,
    tour character varying(3) NOT NULL,
    full_name character varying(255) NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    birth_date date,
    country_id integer,
    height_cm integer,
    hand character varying(80),
    backhand character varying(50),
    website_url text,
    atp_page_url text,
    twitter_handle character varying(80),
    instagram_handle character varying(80),
    facebook_url text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT players_check CHECK (((((tour)::text = 'ATP'::text) AND (atp_id IS NOT NULL) AND (wta_id IS NULL)) OR (((tour)::text = 'WTA'::text) AND (wta_id IS NOT NULL) AND (atp_id IS NULL)))),
    CONSTRAINT players_tour_check CHECK (((tour)::text = ANY ((ARRAY['ATP'::character varying, 'WTA'::character varying])::text[])))
);


ALTER TABLE public.players OWNER TO laurent;

--
-- TOC entry 5039 (class 0 OID 0)
-- Dependencies: 227
-- Name: TABLE players; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.players IS 'Joueurs ATP et WTA avec informations personnelles et sportives';


--
-- TOC entry 229 (class 1259 OID 27530)
-- Name: tournaments; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.tournaments (
    id integer NOT NULL,
    atp_id integer,
    wta_id integer,
    tour character varying(3) NOT NULL,
    name character varying(255) NOT NULL,
    court_surface_id integer,
    start_date date,
    type_tournoi_id integer,
    country_id integer,
    prize_money_raw character varying(20),
    prize_amount numeric(15,2),
    prize_currency character(3),
    tier_tournoi_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tournaments_check CHECK (((((tour)::text = 'ATP'::text) AND (atp_id IS NOT NULL) AND (wta_id IS NULL)) OR (((tour)::text = 'WTA'::text) AND (wta_id IS NOT NULL) AND (atp_id IS NULL)))),
    CONSTRAINT tournaments_tour_check CHECK (((tour)::text = ANY ((ARRAY['ATP'::character varying, 'WTA'::character varying])::text[])))
);


ALTER TABLE public.tournaments OWNER TO laurent;

--
-- TOC entry 5040 (class 0 OID 0)
-- Dependencies: 229
-- Name: TABLE tournaments; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.tournaments IS 'Tournois ATP et WTA avec détails (lieu, prize money, etc.)';


--
-- TOC entry 244 (class 1259 OID 35247)
-- Name: current_elo_rankings; Type: VIEW; Schema: public; Owner: laurent
--

CREATE VIEW public.current_elo_rankings AS
 WITH latest_winner_matches AS (
         SELECT DISTINCT ON (m.winner_id) m.winner_id AS player_id,
            m.match_date,
            m.winner_elo AS elo_general,
            m.winner_elo_clay AS elo_clay,
            m.winner_elo_grass AS elo_grass,
            m.winner_elo_hard AS elo_hard,
            m.winner_elo_ihard AS elo_ihard,
            m.id AS match_id
           FROM (public.matches m
             JOIN public.tournaments t ON ((m.tournament_id = t.id)))
          WHERE ((m.winner_elo IS NOT NULL) AND (t.type_tournoi_id <> 7))
          ORDER BY m.winner_id, m.match_date DESC, m.id DESC
        ), latest_loser_matches AS (
         SELECT DISTINCT ON (m.loser_id) m.loser_id AS player_id,
            m.match_date,
            m.loser_elo AS elo_general,
            m.loser_elo_clay AS elo_clay,
            m.loser_elo_grass AS elo_grass,
            m.loser_elo_hard AS elo_hard,
            m.loser_elo_ihard AS elo_ihard,
            m.id AS match_id
           FROM (public.matches m
             JOIN public.tournaments t ON ((m.tournament_id = t.id)))
          WHERE ((m.loser_elo IS NOT NULL) AND (t.type_tournoi_id <> 7))
          ORDER BY m.loser_id, m.match_date DESC, m.id DESC
        ), all_latest_matches AS (
         SELECT latest_winner_matches.player_id,
            latest_winner_matches.match_date,
            latest_winner_matches.elo_general,
            latest_winner_matches.elo_clay,
            latest_winner_matches.elo_grass,
            latest_winner_matches.elo_hard,
            latest_winner_matches.elo_ihard,
            latest_winner_matches.match_id
           FROM latest_winner_matches
        UNION ALL
         SELECT latest_loser_matches.player_id,
            latest_loser_matches.match_date,
            latest_loser_matches.elo_general,
            latest_loser_matches.elo_clay,
            latest_loser_matches.elo_grass,
            latest_loser_matches.elo_hard,
            latest_loser_matches.elo_ihard,
            latest_loser_matches.match_id
           FROM latest_loser_matches
        ), latest_player_elo AS (
         SELECT DISTINCT ON (all_latest_matches.player_id) all_latest_matches.player_id,
            all_latest_matches.match_date,
            all_latest_matches.elo_general,
            all_latest_matches.elo_clay,
            all_latest_matches.elo_grass,
            all_latest_matches.elo_hard,
            all_latest_matches.elo_ihard,
            all_latest_matches.match_id
           FROM all_latest_matches
          ORDER BY all_latest_matches.player_id, all_latest_matches.match_date DESC, all_latest_matches.match_id DESC
        )
 SELECT row_number() OVER (PARTITION BY p.tour ORDER BY lpe.elo_general DESC NULLS LAST, p.full_name) AS rank_in_tour,
    row_number() OVER (ORDER BY lpe.elo_general DESC NULLS LAST, p.full_name) AS overall_rank,
    p.id AS player_id,
    p.full_name AS player_name,
    p.first_name,
    p.last_name,
    p.tour,
    c.code AS country_code,
    lpe.elo_general,
    lpe.elo_clay,
    lpe.elo_grass,
    lpe.elo_hard,
    lpe.elo_ihard,
    lpe.match_date AS last_match_date,
    lpe.match_id AS last_match_id,
        CASE
            WHEN (lpe.match_date IS NOT NULL) THEN (CURRENT_DATE - lpe.match_date)
            ELSE NULL::integer
        END AS days_since_last_match,
        CASE
            WHEN (lpe.match_date IS NULL) THEN 'Aucun match'::text
            WHEN (lpe.match_date >= (CURRENT_DATE - '1 mon'::interval)) THEN 'Actif'::text
            WHEN (lpe.match_date >= (CURRENT_DATE - '6 mons'::interval)) THEN 'Peu actif'::text
            WHEN (lpe.match_date >= (CURRENT_DATE - '1 year'::interval)) THEN 'Inactif'::text
            ELSE 'Très inactif'::text
        END AS activity_status,
    r."position" AS official_ranking,
    r.points AS official_points,
    r.ranking_date AS official_ranking_date
   FROM (((public.players p
     LEFT JOIN latest_player_elo lpe ON ((p.id = lpe.player_id)))
     LEFT JOIN public.countries c ON ((p.country_id = c.id)))
     LEFT JOIN ( SELECT DISTINCT ON (player_rankings.player_id) player_rankings.player_id,
            player_rankings."position",
            player_rankings.points,
            player_rankings.ranking_date
           FROM public.player_rankings
          ORDER BY player_rankings.player_id, player_rankings.ranking_date DESC) r ON ((p.id = r.player_id)))
  WHERE ((lpe.elo_general IS NOT NULL) AND (lpe.match_date >= (CURRENT_DATE - '1 year'::interval)))
  ORDER BY lpe.elo_general DESC NULLS LAST, p.full_name;


ALTER VIEW public.current_elo_rankings OWNER TO laurent;

--
-- TOC entry 5041 (class 0 OID 0)
-- Dependencies: 244
-- Name: VIEW current_elo_rankings; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON VIEW public.current_elo_rankings IS 'Vue du classement ELO actuel de tous les joueurs basé sur leur dernier match (hors Futures)';


--
-- TOC entry 230 (class 1259 OID 27568)
-- Name: matches_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.matches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.matches_id_seq OWNER TO laurent;

--
-- TOC entry 5042 (class 0 OID 0)
-- Dependencies: 230
-- Name: matches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.matches_id_seq OWNED BY public.matches.id;


--
-- TOC entry 225 (class 1259 OID 27487)
-- Name: rounds; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.rounds (
    id integer NOT NULL,
    atp_id integer NOT NULL,
    name character varying(50) NOT NULL,
    is_qualifying boolean DEFAULT false,
    display_order integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.rounds OWNER TO laurent;

--
-- TOC entry 5043 (class 0 OID 0)
-- Dependencies: 225
-- Name: TABLE rounds; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.rounds IS 'Tours dans un tournoi (Finale, Demi-finale, etc.)';


--
-- TOC entry 221 (class 1259 OID 27467)
-- Name: type_tournoi; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.type_tournoi (
    id integer NOT NULL,
    id_r integer NOT NULL,
    nom character varying(63) NOT NULL,
    name character varying(63) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.type_tournoi OWNER TO laurent;

--
-- TOC entry 5044 (class 0 OID 0)
-- Dependencies: 221
-- Name: TABLE type_tournoi; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.type_tournoi IS 'Types de tournois (Grand Slam, Masters 1000, ATP 500, etc.)';


--
-- TOC entry 245 (class 1259 OID 35252)
-- Name: player_matches_detailed; Type: VIEW; Schema: public; Owner: laurent
--

CREATE VIEW public.player_matches_detailed AS
 WITH player_matches AS (
         SELECT m.id AS match_id,
            m.match_date,
            m.winner_id AS player_id,
            m.loser_id AS opponent_id,
            'Victoire'::text AS result,
            m.score_raw,
            m.winner_elo AS player_elo_general,
            m.winner_elo_clay AS player_elo_clay,
            m.winner_elo_grass AS player_elo_grass,
            m.winner_elo_hard AS player_elo_hard,
            m.winner_elo_ihard AS player_elo_ihard,
            m.loser_elo AS opponent_elo_general,
            m.loser_elo_clay AS opponent_elo_clay,
            m.loser_elo_grass AS opponent_elo_grass,
            m.loser_elo_hard AS opponent_elo_hard,
            m.loser_elo_ihard AS opponent_elo_ihard,
            m.winner_ranking AS player_ranking,
            m.winner_points AS player_points,
            m.loser_ranking AS opponent_ranking,
            m.loser_points AS opponent_points,
            m.tournament_id,
            m.round_id
           FROM public.matches m
        UNION ALL
         SELECT m.id AS match_id,
            m.match_date,
            m.loser_id AS player_id,
            m.winner_id AS opponent_id,
            'Défaite'::text AS result,
            m.score_raw,
            m.loser_elo AS player_elo_general,
            m.loser_elo_clay AS player_elo_clay,
            m.loser_elo_grass AS player_elo_grass,
            m.loser_elo_hard AS player_elo_hard,
            m.loser_elo_ihard AS player_elo_ihard,
            m.winner_elo AS opponent_elo_general,
            m.winner_elo_clay AS opponent_elo_clay,
            m.winner_elo_grass AS opponent_elo_grass,
            m.winner_elo_hard AS opponent_elo_hard,
            m.winner_elo_ihard AS opponent_elo_ihard,
            m.loser_ranking AS player_ranking,
            m.loser_points AS player_points,
            m.winner_ranking AS opponent_ranking,
            m.winner_points AS opponent_points,
            m.tournament_id,
            m.round_id
           FROM public.matches m
        )
 SELECT pm.match_id,
    pm.match_date,
    pm.player_id,
    p.full_name AS player_name,
    p.tour AS player_tour,
    pc.code AS player_country,
    pm.opponent_id,
    op.full_name AS opponent_name,
    op.tour AS opponent_tour,
    opc.code AS opponent_country,
    pm.result,
    pm.score_raw AS score,
    pm.player_ranking,
    pm.player_points,
    pm.opponent_ranking,
    pm.opponent_points,
    pm.player_elo_general,
    pm.opponent_elo_general,
    pm.player_elo_clay,
    pm.opponent_elo_clay,
    pm.player_elo_grass,
    pm.opponent_elo_grass,
    pm.player_elo_hard,
    pm.opponent_elo_hard,
    pm.player_elo_ihard,
    pm.opponent_elo_ihard,
    t.name AS tournament_name,
    t.start_date AS tournament_date,
    cs.name AS surface,
    tt.name AS tournament_type,
    c.code AS tournament_country,
    r.name AS round_name,
    r.is_qualifying,
        CASE
            WHEN ((pm.player_ranking IS NOT NULL) AND (pm.opponent_ranking IS NOT NULL)) THEN (pm.opponent_ranking - pm.player_ranking)
            ELSE NULL::integer
        END AS ranking_difference,
        CASE
            WHEN ((pm.player_elo_general IS NOT NULL) AND (pm.opponent_elo_general IS NOT NULL)) THEN (pm.player_elo_general - pm.opponent_elo_general)
            ELSE NULL::integer
        END AS elo_difference
   FROM (((((((((player_matches pm
     LEFT JOIN public.players p ON ((pm.player_id = p.id)))
     LEFT JOIN public.countries pc ON ((p.country_id = pc.id)))
     LEFT JOIN public.players op ON ((pm.opponent_id = op.id)))
     LEFT JOIN public.countries opc ON ((op.country_id = opc.id)))
     LEFT JOIN public.tournaments t ON ((pm.tournament_id = t.id)))
     LEFT JOIN public.court_surfaces cs ON ((t.court_surface_id = cs.id)))
     LEFT JOIN public.type_tournoi tt ON ((t.type_tournoi_id = tt.id)))
     LEFT JOIN public.countries c ON ((t.country_id = c.id)))
     LEFT JOIN public.rounds r ON ((pm.round_id = r.id)))
  ORDER BY pm.match_date DESC, pm.match_id DESC;


ALTER VIEW public.player_matches_detailed OWNER TO laurent;

--
-- TOC entry 5045 (class 0 OID 0)
-- Dependencies: 245
-- Name: VIEW player_matches_detailed; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON VIEW public.player_matches_detailed IS 'Vue détaillée de tous les matchs pour chaque joueur avec classements et ELO';


--
-- TOC entry 232 (class 1259 OID 27609)
-- Name: player_rankings_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.player_rankings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.player_rankings_id_seq OWNER TO laurent;

--
-- TOC entry 5046 (class 0 OID 0)
-- Dependencies: 232
-- Name: player_rankings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.player_rankings_id_seq OWNED BY public.player_rankings.id;


--
-- TOC entry 235 (class 1259 OID 27629)
-- Name: player_tournament_status; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.player_tournament_status (
    id integer NOT NULL,
    player_id integer NOT NULL,
    tournament_id integer NOT NULL,
    seeding_raw character varying(10),
    seed_number integer,
    is_seeded boolean DEFAULT false,
    is_wildcard boolean DEFAULT false,
    is_qualifier boolean DEFAULT false,
    is_lucky_loser boolean DEFAULT false,
    is_protected_ranking boolean DEFAULT false,
    is_special_exempt boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.player_tournament_status OWNER TO laurent;

--
-- TOC entry 5047 (class 0 OID 0)
-- Dependencies: 235
-- Name: TABLE player_tournament_status; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.player_tournament_status IS 'Statut des joueurs dans les tournois (têtes de série, wildcards, etc.)';


--
-- TOC entry 234 (class 1259 OID 27628)
-- Name: player_tournament_status_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.player_tournament_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.player_tournament_status_id_seq OWNER TO laurent;

--
-- TOC entry 5048 (class 0 OID 0)
-- Dependencies: 234
-- Name: player_tournament_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.player_tournament_status_id_seq OWNED BY public.player_tournament_status.id;


--
-- TOC entry 226 (class 1259 OID 27500)
-- Name: players_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.players_id_seq OWNER TO laurent;

--
-- TOC entry 5049 (class 0 OID 0)
-- Dependencies: 226
-- Name: players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.players_id_seq OWNED BY public.players.id;


--
-- TOC entry 224 (class 1259 OID 27486)
-- Name: rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.rounds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rounds_id_seq OWNER TO laurent;

--
-- TOC entry 5050 (class 0 OID 0)
-- Dependencies: 224
-- Name: rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.rounds_id_seq OWNED BY public.rounds.id;


--
-- TOC entry 243 (class 1259 OID 35219)
-- Name: sync_alerts; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.sync_alerts (
    id integer NOT NULL,
    sync_log_id integer,
    alert_type character varying(20) NOT NULL,
    severity character varying(10) DEFAULT 'info'::character varying NOT NULL,
    message text NOT NULL,
    details jsonb,
    resolved boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp without time zone
);


ALTER TABLE public.sync_alerts OWNER TO laurent;

--
-- TOC entry 242 (class 1259 OID 35218)
-- Name: sync_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.sync_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sync_alerts_id_seq OWNER TO laurent;

--
-- TOC entry 5051 (class 0 OID 0)
-- Dependencies: 242
-- Name: sync_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.sync_alerts_id_seq OWNED BY public.sync_alerts.id;


--
-- TOC entry 239 (class 1259 OID 35187)
-- Name: sync_log; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.sync_log (
    id integer NOT NULL,
    sync_type character varying(20) DEFAULT 'incremental'::character varying NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    duration_seconds integer,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    last_sync_date timestamp without time zone,
    total_records_processed integer DEFAULT 0,
    total_errors integer DEFAULT 0,
    sync_stats jsonb,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sync_log OWNER TO laurent;

--
-- TOC entry 238 (class 1259 OID 35186)
-- Name: sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sync_log_id_seq OWNER TO laurent;

--
-- TOC entry 5052 (class 0 OID 0)
-- Dependencies: 238
-- Name: sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.sync_log_id_seq OWNED BY public.sync_log.id;


--
-- TOC entry 241 (class 1259 OID 35201)
-- Name: sync_metrics; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.sync_metrics (
    id integer NOT NULL,
    sync_log_id integer,
    table_name character varying(50) NOT NULL,
    operation character varying(20) NOT NULL,
    records_processed integer DEFAULT 0,
    records_inserted integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    records_failed integer DEFAULT 0,
    processing_time_ms integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sync_metrics OWNER TO laurent;

--
-- TOC entry 240 (class 1259 OID 35200)
-- Name: sync_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.sync_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sync_metrics_id_seq OWNER TO laurent;

--
-- TOC entry 5053 (class 0 OID 0)
-- Dependencies: 240
-- Name: sync_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.sync_metrics_id_seq OWNED BY public.sync_metrics.id;


--
-- TOC entry 223 (class 1259 OID 27477)
-- Name: tier_tournoi; Type: TABLE; Schema: public; Owner: laurent
--

CREATE TABLE public.tier_tournoi (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    description character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tier_tournoi OWNER TO laurent;

--
-- TOC entry 5054 (class 0 OID 0)
-- Dependencies: 223
-- Name: TABLE tier_tournoi; Type: COMMENT; Schema: public; Owner: laurent
--

COMMENT ON TABLE public.tier_tournoi IS 'Tiers de tournois (rempli dynamiquement depuis Access)';


--
-- TOC entry 222 (class 1259 OID 27476)
-- Name: tier_tournoi_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.tier_tournoi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tier_tournoi_id_seq OWNER TO laurent;

--
-- TOC entry 5055 (class 0 OID 0)
-- Dependencies: 222
-- Name: tier_tournoi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.tier_tournoi_id_seq OWNED BY public.tier_tournoi.id;


--
-- TOC entry 228 (class 1259 OID 27529)
-- Name: tournaments_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.tournaments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tournaments_id_seq OWNER TO laurent;

--
-- TOC entry 5056 (class 0 OID 0)
-- Dependencies: 228
-- Name: tournaments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.tournaments_id_seq OWNED BY public.tournaments.id;


--
-- TOC entry 220 (class 1259 OID 27466)
-- Name: type_tournoi_id_seq; Type: SEQUENCE; Schema: public; Owner: laurent
--

CREATE SEQUENCE public.type_tournoi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.type_tournoi_id_seq OWNER TO laurent;

--
-- TOC entry 5057 (class 0 OID 0)
-- Dependencies: 220
-- Name: type_tournoi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: laurent
--

ALTER SEQUENCE public.type_tournoi_id_seq OWNED BY public.type_tournoi.id;


--
-- TOC entry 237 (class 1259 OID 27664)
-- Name: v_head_to_head; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_head_to_head AS
 SELECT LEAST(winner_id, loser_id) AS player1_id,
    GREATEST(winner_id, loser_id) AS player2_id,
    count(*) AS total_matches,
    sum(
        CASE
            WHEN (winner_id = LEAST(winner_id, loser_id)) THEN 1
            ELSE 0
        END) AS player1_wins,
    sum(
        CASE
            WHEN (winner_id = GREATEST(winner_id, loser_id)) THEN 1
            ELSE 0
        END) AS player2_wins
   FROM public.matches m
  GROUP BY LEAST(winner_id, loser_id), GREATEST(winner_id, loser_id);


ALTER VIEW public.v_head_to_head OWNER TO postgres;

--
-- TOC entry 5058 (class 0 OID 0)
-- Dependencies: 237
-- Name: VIEW v_head_to_head; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.v_head_to_head IS 'Statistiques head-to-head entre tous les joueurs';


--
-- TOC entry 236 (class 1259 OID 27659)
-- Name: v_matches_detailed; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_matches_detailed AS
 SELECT m.id,
    m.tour,
    m.winner_id,
    m.loser_id,
    m.tournament_id,
    m.round_id,
    m.score_raw,
    m.match_date,
    m.sets_winner,
    m.sets_loser,
    m.total_sets,
    m.games_winner,
    m.games_loser,
    m.total_games,
    m.has_tiebreak,
    m.tiebreaks_count,
    m.is_walkover,
    m.winner_ranking,
    m.winner_points,
    m.loser_ranking,
    m.loser_points,
    m.winner_odds,
    m.loser_odds,
    m.created_at,
    m.updated_at,
    w.full_name AS winner_name,
    l.full_name AS loser_name,
    t.name AS tournament_name,
    r.name AS round_name,
    cs.name AS surface_name,
    c.code AS country_code
   FROM ((((((public.matches m
     JOIN public.players w ON ((m.winner_id = w.id)))
     JOIN public.players l ON ((m.loser_id = l.id)))
     JOIN public.tournaments t ON ((m.tournament_id = t.id)))
     JOIN public.rounds r ON ((m.round_id = r.id)))
     JOIN public.court_surfaces cs ON ((t.court_surface_id = cs.id)))
     JOIN public.countries c ON ((t.country_id = c.id)));


ALTER VIEW public.v_matches_detailed OWNER TO postgres;

--
-- TOC entry 5059 (class 0 OID 0)
-- Dependencies: 236
-- Name: VIEW v_matches_detailed; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.v_matches_detailed IS 'Vue détaillée des matchs avec tous les noms lisibles';


--
-- TOC entry 4711 (class 2604 OID 27449)
-- Name: countries id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.countries ALTER COLUMN id SET DEFAULT nextval('public.countries_id_seq'::regclass);


--
-- TOC entry 4713 (class 2604 OID 27459)
-- Name: court_surfaces id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.court_surfaces ALTER COLUMN id SET DEFAULT nextval('public.court_surfaces_id_seq'::regclass);


--
-- TOC entry 4728 (class 2604 OID 27572)
-- Name: matches id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.matches ALTER COLUMN id SET DEFAULT nextval('public.matches_id_seq'::regclass);


--
-- TOC entry 4734 (class 2604 OID 27613)
-- Name: player_rankings id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_rankings ALTER COLUMN id SET DEFAULT nextval('public.player_rankings_id_seq'::regclass);


--
-- TOC entry 4736 (class 2604 OID 27632)
-- Name: player_tournament_status id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_tournament_status ALTER COLUMN id SET DEFAULT nextval('public.player_tournament_status_id_seq'::regclass);


--
-- TOC entry 4722 (class 2604 OID 27504)
-- Name: players id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.players ALTER COLUMN id SET DEFAULT nextval('public.players_id_seq'::regclass);


--
-- TOC entry 4719 (class 2604 OID 27490)
-- Name: rounds id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.rounds ALTER COLUMN id SET DEFAULT nextval('public.rounds_id_seq'::regclass);


--
-- TOC entry 4757 (class 2604 OID 35222)
-- Name: sync_alerts id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_alerts ALTER COLUMN id SET DEFAULT nextval('public.sync_alerts_id_seq'::regclass);


--
-- TOC entry 4744 (class 2604 OID 35190)
-- Name: sync_log id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_log ALTER COLUMN id SET DEFAULT nextval('public.sync_log_id_seq'::regclass);


--
-- TOC entry 4750 (class 2604 OID 35204)
-- Name: sync_metrics id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_metrics ALTER COLUMN id SET DEFAULT nextval('public.sync_metrics_id_seq'::regclass);


--
-- TOC entry 4717 (class 2604 OID 27480)
-- Name: tier_tournoi id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tier_tournoi ALTER COLUMN id SET DEFAULT nextval('public.tier_tournoi_id_seq'::regclass);


--
-- TOC entry 4725 (class 2604 OID 27533)
-- Name: tournaments id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tournaments ALTER COLUMN id SET DEFAULT nextval('public.tournaments_id_seq'::regclass);


--
-- TOC entry 4715 (class 2604 OID 27470)
-- Name: type_tournoi id; Type: DEFAULT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.type_tournoi ALTER COLUMN id SET DEFAULT nextval('public.type_tournoi_id_seq'::regclass);


--
-- TOC entry 4767 (class 2606 OID 27454)
-- Name: countries countries_code_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_code_key UNIQUE (code);


--
-- TOC entry 4769 (class 2606 OID 27452)
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- TOC entry 4771 (class 2606 OID 27464)
-- Name: court_surfaces court_surfaces_name_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.court_surfaces
    ADD CONSTRAINT court_surfaces_name_key UNIQUE (name);


--
-- TOC entry 4773 (class 2606 OID 27462)
-- Name: court_surfaces court_surfaces_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.court_surfaces
    ADD CONSTRAINT court_surfaces_pkey PRIMARY KEY (id);


--
-- TOC entry 4828 (class 2606 OID 27580)
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- TOC entry 4834 (class 2606 OID 27616)
-- Name: player_rankings player_rankings_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_pkey PRIMARY KEY (id);


--
-- TOC entry 4836 (class 2606 OID 27618)
-- Name: player_rankings player_rankings_player_id_ranking_date_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_player_id_ranking_date_key UNIQUE (player_id, ranking_date);


--
-- TOC entry 4843 (class 2606 OID 27641)
-- Name: player_tournament_status player_tournament_status_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_tournament_status
    ADD CONSTRAINT player_tournament_status_pkey PRIMARY KEY (id);


--
-- TOC entry 4845 (class 2606 OID 27643)
-- Name: player_tournament_status player_tournament_status_player_id_tournament_id_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_tournament_status
    ADD CONSTRAINT player_tournament_status_player_id_tournament_id_key UNIQUE (player_id, tournament_id);


--
-- TOC entry 4798 (class 2606 OID 27514)
-- Name: players players_atp_id_tour_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_atp_id_tour_key UNIQUE (atp_id, tour);


--
-- TOC entry 4800 (class 2606 OID 27512)
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- TOC entry 4802 (class 2606 OID 27516)
-- Name: players players_wta_id_tour_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_wta_id_tour_key UNIQUE (wta_id, tour);


--
-- TOC entry 4787 (class 2606 OID 27496)
-- Name: rounds rounds_atp_id_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.rounds
    ADD CONSTRAINT rounds_atp_id_key UNIQUE (atp_id);


--
-- TOC entry 4789 (class 2606 OID 27494)
-- Name: rounds rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.rounds
    ADD CONSTRAINT rounds_pkey PRIMARY KEY (id);


--
-- TOC entry 4855 (class 2606 OID 35229)
-- Name: sync_alerts sync_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_alerts
    ADD CONSTRAINT sync_alerts_pkey PRIMARY KEY (id);


--
-- TOC entry 4849 (class 2606 OID 35199)
-- Name: sync_log sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_log
    ADD CONSTRAINT sync_log_pkey PRIMARY KEY (id);


--
-- TOC entry 4852 (class 2606 OID 35212)
-- Name: sync_metrics sync_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_metrics
    ADD CONSTRAINT sync_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 4780 (class 2606 OID 27485)
-- Name: tier_tournoi tier_tournoi_code_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tier_tournoi
    ADD CONSTRAINT tier_tournoi_code_key UNIQUE (code);


--
-- TOC entry 4782 (class 2606 OID 27483)
-- Name: tier_tournoi tier_tournoi_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tier_tournoi
    ADD CONSTRAINT tier_tournoi_pkey PRIMARY KEY (id);


--
-- TOC entry 4812 (class 2606 OID 27539)
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- TOC entry 4776 (class 2606 OID 27475)
-- Name: type_tournoi type_tournoi_id_r_key; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.type_tournoi
    ADD CONSTRAINT type_tournoi_id_r_key UNIQUE (id_r);


--
-- TOC entry 4778 (class 2606 OID 27473)
-- Name: type_tournoi type_tournoi_pkey; Type: CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.type_tournoi
    ADD CONSTRAINT type_tournoi_pkey PRIMARY KEY (id);


--
-- TOC entry 4774 (class 1259 OID 27465)
-- Name: idx_court_surfaces_name; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_court_surfaces_name ON public.court_surfaces USING btree (name);


--
-- TOC entry 4813 (class 1259 OID 27605)
-- Name: idx_matches_date; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_date ON public.matches USING btree (match_date);


--
-- TOC entry 4814 (class 1259 OID 35243)
-- Name: idx_matches_elo_clay; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_elo_clay ON public.matches USING btree (winner_elo_clay, loser_elo_clay);


--
-- TOC entry 4815 (class 1259 OID 35244)
-- Name: idx_matches_elo_grass; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_elo_grass ON public.matches USING btree (winner_elo_grass, loser_elo_grass);


--
-- TOC entry 4816 (class 1259 OID 35245)
-- Name: idx_matches_elo_hard; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_elo_hard ON public.matches USING btree (winner_elo_hard, loser_elo_hard);


--
-- TOC entry 4817 (class 1259 OID 35246)
-- Name: idx_matches_elo_ihard; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_elo_ihard ON public.matches USING btree (winner_elo_ihard, loser_elo_ihard);


--
-- TOC entry 4818 (class 1259 OID 35242)
-- Name: idx_matches_loser_elo; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_loser_elo ON public.matches USING btree (loser_elo);


--
-- TOC entry 4819 (class 1259 OID 27602)
-- Name: idx_matches_loser_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_loser_id ON public.matches USING btree (loser_id);


--
-- TOC entry 4820 (class 1259 OID 27608)
-- Name: idx_matches_loser_tournament; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_loser_tournament ON public.matches USING btree (loser_id, tournament_id);


--
-- TOC entry 4821 (class 1259 OID 27604)
-- Name: idx_matches_round_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_round_id ON public.matches USING btree (round_id);


--
-- TOC entry 4822 (class 1259 OID 27606)
-- Name: idx_matches_tour; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_tour ON public.matches USING btree (tour);


--
-- TOC entry 4823 (class 1259 OID 27603)
-- Name: idx_matches_tournament_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_tournament_id ON public.matches USING btree (tournament_id);


--
-- TOC entry 4824 (class 1259 OID 35241)
-- Name: idx_matches_winner_elo; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_winner_elo ON public.matches USING btree (winner_elo);


--
-- TOC entry 4825 (class 1259 OID 27601)
-- Name: idx_matches_winner_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_winner_id ON public.matches USING btree (winner_id);


--
-- TOC entry 4826 (class 1259 OID 27607)
-- Name: idx_matches_winner_tournament; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_matches_winner_tournament ON public.matches USING btree (winner_id, tournament_id);


--
-- TOC entry 4790 (class 1259 OID 27524)
-- Name: idx_players_atp_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_players_atp_id ON public.players USING btree (atp_id);


--
-- TOC entry 4791 (class 1259 OID 27523)
-- Name: idx_players_birth_date; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_players_birth_date ON public.players USING btree (birth_date);


--
-- TOC entry 4792 (class 1259 OID 27522)
-- Name: idx_players_country_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_players_country_id ON public.players USING btree (country_id);


--
-- TOC entry 4793 (class 1259 OID 28221)
-- Name: idx_players_hand; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_players_hand ON public.players USING btree (hand);


--
-- TOC entry 4794 (class 1259 OID 27528)
-- Name: idx_players_height; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_players_height ON public.players USING btree (height_cm);


--
-- TOC entry 4795 (class 1259 OID 27526)
-- Name: idx_players_tour; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_players_tour ON public.players USING btree (tour);


--
-- TOC entry 4796 (class 1259 OID 27525)
-- Name: idx_players_wta_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_players_wta_id ON public.players USING btree (wta_id);


--
-- TOC entry 4829 (class 1259 OID 27624)
-- Name: idx_rankings_date; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_rankings_date ON public.player_rankings USING btree (ranking_date);


--
-- TOC entry 4830 (class 1259 OID 27627)
-- Name: idx_rankings_player_date; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_rankings_player_date ON public.player_rankings USING btree (player_id, ranking_date);


--
-- TOC entry 4831 (class 1259 OID 27625)
-- Name: idx_rankings_player_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_rankings_player_id ON public.player_rankings USING btree (player_id);


--
-- TOC entry 4832 (class 1259 OID 27626)
-- Name: idx_rankings_position; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_rankings_position ON public.player_rankings USING btree ("position");


--
-- TOC entry 4783 (class 1259 OID 27497)
-- Name: idx_rounds_atp_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_rounds_atp_id ON public.rounds USING btree (atp_id);


--
-- TOC entry 4784 (class 1259 OID 27498)
-- Name: idx_rounds_display_order; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_rounds_display_order ON public.rounds USING btree (display_order);


--
-- TOC entry 4785 (class 1259 OID 27499)
-- Name: idx_rounds_is_qualifying; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_rounds_is_qualifying ON public.rounds USING btree (is_qualifying);


--
-- TOC entry 4853 (class 1259 OID 35238)
-- Name: idx_sync_alerts_unresolved; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_sync_alerts_unresolved ON public.sync_alerts USING btree (resolved) WHERE (resolved = false);


--
-- TOC entry 4846 (class 1259 OID 35235)
-- Name: idx_sync_log_start_time; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_sync_log_start_time ON public.sync_log USING btree (start_time);


--
-- TOC entry 4847 (class 1259 OID 35236)
-- Name: idx_sync_log_status; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_sync_log_status ON public.sync_log USING btree (status);


--
-- TOC entry 4850 (class 1259 OID 35237)
-- Name: idx_sync_metrics_sync_log_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_sync_metrics_sync_log_id ON public.sync_metrics USING btree (sync_log_id);


--
-- TOC entry 4837 (class 1259 OID 27654)
-- Name: idx_tournament_status_player; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournament_status_player ON public.player_tournament_status USING btree (player_id);


--
-- TOC entry 4838 (class 1259 OID 27658)
-- Name: idx_tournament_status_qualifier; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournament_status_qualifier ON public.player_tournament_status USING btree (is_qualifier);


--
-- TOC entry 4839 (class 1259 OID 27656)
-- Name: idx_tournament_status_seeded; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournament_status_seeded ON public.player_tournament_status USING btree (is_seeded);


--
-- TOC entry 4840 (class 1259 OID 27655)
-- Name: idx_tournament_status_tournament; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournament_status_tournament ON public.player_tournament_status USING btree (tournament_id);


--
-- TOC entry 4841 (class 1259 OID 27657)
-- Name: idx_tournament_status_wildcard; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournament_status_wildcard ON public.player_tournament_status USING btree (is_wildcard);


--
-- TOC entry 4803 (class 1259 OID 27565)
-- Name: idx_tournaments_atp_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_atp_id ON public.tournaments USING btree (atp_id);


--
-- TOC entry 4804 (class 1259 OID 27561)
-- Name: idx_tournaments_country_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_country_id ON public.tournaments USING btree (country_id);


--
-- TOC entry 4805 (class 1259 OID 27562)
-- Name: idx_tournaments_court_surface_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_court_surface_id ON public.tournaments USING btree (court_surface_id);


--
-- TOC entry 4806 (class 1259 OID 27560)
-- Name: idx_tournaments_start_date; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_start_date ON public.tournaments USING btree (start_date);


--
-- TOC entry 4807 (class 1259 OID 27564)
-- Name: idx_tournaments_tier_tournoi_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_tier_tournoi_id ON public.tournaments USING btree (tier_tournoi_id);


--
-- TOC entry 4808 (class 1259 OID 27567)
-- Name: idx_tournaments_tour; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_tour ON public.tournaments USING btree (tour);


--
-- TOC entry 4809 (class 1259 OID 27563)
-- Name: idx_tournaments_type_tournoi_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_type_tournoi_id ON public.tournaments USING btree (type_tournoi_id);


--
-- TOC entry 4810 (class 1259 OID 27566)
-- Name: idx_tournaments_wta_id; Type: INDEX; Schema: public; Owner: laurent
--

CREATE INDEX idx_tournaments_wta_id ON public.tournaments USING btree (wta_id);


--
-- TOC entry 4861 (class 2606 OID 27586)
-- Name: matches matches_loser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_loser_id_fkey FOREIGN KEY (loser_id) REFERENCES public.players(id);


--
-- TOC entry 4862 (class 2606 OID 27596)
-- Name: matches matches_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.rounds(id);


--
-- TOC entry 4863 (class 2606 OID 27591)
-- Name: matches matches_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id);


--
-- TOC entry 4864 (class 2606 OID 27581)
-- Name: matches matches_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.players(id);


--
-- TOC entry 4865 (class 2606 OID 27619)
-- Name: player_rankings player_rankings_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- TOC entry 4866 (class 2606 OID 27644)
-- Name: player_tournament_status player_tournament_status_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_tournament_status
    ADD CONSTRAINT player_tournament_status_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- TOC entry 4867 (class 2606 OID 27649)
-- Name: player_tournament_status player_tournament_status_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.player_tournament_status
    ADD CONSTRAINT player_tournament_status_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id);


--
-- TOC entry 4856 (class 2606 OID 27517)
-- Name: players players_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- TOC entry 4869 (class 2606 OID 35230)
-- Name: sync_alerts sync_alerts_sync_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_alerts
    ADD CONSTRAINT sync_alerts_sync_log_id_fkey FOREIGN KEY (sync_log_id) REFERENCES public.sync_log(id) ON DELETE CASCADE;


--
-- TOC entry 4868 (class 2606 OID 35213)
-- Name: sync_metrics sync_metrics_sync_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.sync_metrics
    ADD CONSTRAINT sync_metrics_sync_log_id_fkey FOREIGN KEY (sync_log_id) REFERENCES public.sync_log(id) ON DELETE CASCADE;


--
-- TOC entry 4857 (class 2606 OID 27550)
-- Name: tournaments tournaments_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- TOC entry 4858 (class 2606 OID 27540)
-- Name: tournaments tournaments_court_surface_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_court_surface_id_fkey FOREIGN KEY (court_surface_id) REFERENCES public.court_surfaces(id);


--
-- TOC entry 4859 (class 2606 OID 27555)
-- Name: tournaments tournaments_tier_tournoi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_tier_tournoi_id_fkey FOREIGN KEY (tier_tournoi_id) REFERENCES public.tier_tournoi(id);


--
-- TOC entry 4860 (class 2606 OID 27545)
-- Name: tournaments tournaments_type_tournoi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: laurent
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_type_tournoi_id_fkey FOREIGN KEY (type_tournoi_id) REFERENCES public.type_tournoi(id);


-- Completed on 2025-06-26 18:45:41

--
-- PostgreSQL database dump complete
--

