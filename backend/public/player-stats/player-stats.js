// Récupérer l'ID du joueur depuis l'URL
function getPlayerIdFromUrl() {
    const pathParts = window.location.pathname.split('/');
    return pathParts[pathParts.length - 1];
}

// Charger les informations du joueur
async function loadPlayerInfo() {
    const playerId = getPlayerIdFromUrl();

    if (!playerId || isNaN(playerId)) {
        showError();
        return;
    }

    try {
        const response = await fetch(`/api/v1/players/${playerId}`);

        if (!response.ok) {
            throw new Error('Joueur non trouvé');
        }

        const data = await response.json();
        displayPlayerInfo(data);

    } catch (error) {
        console.error('Erreur:', error);
        showError();
    }
}

// Afficher les informations du joueur
function displayPlayerInfo(player) {
    // Cacher le loading
    document.getElementById('loading').classList.add('hidden');

    // Construire le texte à afficher pour le nom
    let displayText = `${player.first_name} ${player.last_name}`;

    // Ajouter le pays s'il existe
    if (player.country_code) {
        displayText += ` (${player.country_code})`;
    }

    // Ajouter le classement
    if (player.current_ranking) {
        displayText += ` : N°${player.current_ranking.position}`;
        // Ajouter les points s'ils existent
        if (player.current_ranking.points) {
            displayText += ` (${player.current_ranking.points} pts)`;
        }
    } else {
        displayText += ` : NC`;
    }

    // Afficher le nom avec classement
    const playerNameElement = document.getElementById('player-name');
    playerNameElement.textContent = displayText;

    // Afficher les statistiques de carrière
    if (player.career_stats) {
        const careerStatsElement = document.getElementById('career-stats');
        const totalMatches = player.career_stats.total_matches;
        const totalWins = player.career_stats.total_wins;

        // Calculer le pourcentage de victoires
        const winPercentage = totalMatches > 0
            ? Math.round((totalWins / totalMatches) * 100)
            : 0;

        careerStatsElement.textContent =
            `${totalMatches} matchs - ${totalWins} victoires (${winPercentage}%)`;
    }

    // Afficher la section player-info
    document.getElementById('player-info').classList.remove('hidden');
}

// Afficher l'erreur
function showError() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
}

// Charger les données au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    loadPlayerInfo();
});