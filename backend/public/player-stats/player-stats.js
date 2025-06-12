class PlayerStats {
    constructor() {
        this.playerId = this.getPlayerIdFromUrl();
        this.currentPage = 0;
        this.limit = 100;
        this.playerData = null;

        this.initializeEventListeners();
        this.loadPlayerData();
    }

    getPlayerIdFromUrl() {
        const pathParts = window.location.pathname.split('/');
        return pathParts[pathParts.length - 1];
    }

    initializeEventListeners() {
        // Pagination
        document.getElementById('prev-page').addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.loadMatches();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            this.currentPage++;
            this.loadMatches();
        });
    }

    async loadPlayerData() {
        if (!this.playerId || isNaN(this.playerId)) {
            this.showError();
            return;
        }

        try {
            const response = await fetch(`/api/v1/players/${this.playerId}`);

            if (!response.ok) {
                throw new Error('Joueur non trouvé');
            }

            this.playerData = await response.json();
            this.displayPlayerInfo(this.playerData);
            this.loadMatches();

        } catch (error) {
            console.error('Erreur:', error);
            this.showError();
        }
    }

    async loadMatches() {
        this.showMatchesLoading();

        try {
            const offset = this.currentPage * this.limit;
            let url = `/api/v1/players/${this.playerId}/matches?limit=${this.limit}&offset=${offset}`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error('Erreur lors du chargement des matchs');
            }

            const data = await response.json();
            this.displayMatches(data);

        } catch (error) {
            console.error('Erreur chargement matchs:', error);
            this.showNoMatches();
        }
    }

    displayPlayerInfo(player) {
        // Cacher le loading
        document.getElementById('loading').classList.add('hidden');

        // Nom du joueur avec classement actuel
        let displayName = `${player.first_name} ${player.last_name}`;
        if (player.current_ranking) {
            displayName += ` (${player.current_ranking.position})`;
        }
        if (player.country_code) {
            displayName += ` - ${player.country_code}`;
        }
        document.getElementById('player-name').textContent = displayName;

        // Détails du joueur
        let details = `Joueur ${player.tour}`;
        if (player.latest_ranking_date) {
            details += ` • Dernier classement: ${this.formatDate(player.latest_ranking_date)}`;
        }
        document.getElementById('player-details').textContent = details;

        // Badge du classement
        const rankingBadge = document.getElementById('ranking-badge');
        if (player.current_ranking) {
            rankingBadge.innerHTML = `
                <div class="text-right">
                    <div class="text-2xl font-bold text-blue-600">N°${player.current_ranking.position}</div>
                    <div class="text-sm text-gray-500">${player.current_ranking.points} pts</div>
                </div>
            `;
        } else {
            rankingBadge.innerHTML = `
                <div class="text-right">
                    <div class="text-2xl font-bold text-gray-400">NC</div>
                    <div class="text-sm text-gray-500">Non classé</div>
                </div>
            `;
        }

        // Statistiques rapides
        const stats = player.career_stats;
        const winPercentage = stats.total_matches > 0
            ? Math.round((stats.total_wins / stats.total_matches) * 100)
            : 0;

        document.getElementById('quick-stats').innerHTML = `
            <div class="text-center">
                <div class="text-2xl font-bold text-gray-900">${stats.total_matches}</div>
                <div class="text-sm text-gray-500">Matchs</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-bold text-green-600">${stats.total_wins}</div>
                <div class="text-sm text-gray-500">Victoires</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-bold text-red-600">${stats.total_losses}</div>
                <div class="text-sm text-gray-500">Défaites</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-bold text-blue-600">${winPercentage}%</div>
                <div class="text-sm text-gray-500">Victoires</div>
            </div>
        `;

        // Afficher la section
        document.getElementById('player-info').classList.remove('hidden');
    }

    displayMatches(data) {
        const tbody = document.getElementById('matches-tbody');
        tbody.innerHTML = '';

        if (!data.matches || data.matches.length === 0) {
            this.showNoMatches();
            return;
        }

        data.matches.forEach(match => {
            const row = this.createMatchRow(match);
            tbody.appendChild(row);
        });

        this.updateMatchesCount(data.pagination.total);
        this.updatePagination(data.pagination);
        this.showMatches();
    }

    createMatchRow(match) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';

        // Déterminer l'adversaire
        const isWinner = match.result.player_result === 'WON';
        const opponent = isWinner ? match.result.loser : match.result.winner;

        // Classe pour le résultat
        const resultClass = isWinner ? 'badge-won' : 'badge-lost';
        const resultText = isWinner ? 'V' : 'D';

        // Surface
        const surfaceClass = this.getSurfaceClass(match.tournament.surface);

        // Formatage du nom du tournoi avec pays
        const tournamentDisplay = match.tournament.name
            ? `${match.tournament.name}${match.tournament.country ? ` (${match.tournament.country})` : ''}`
            : 'N/A';

        // Formatage du nom de l'adversaire avec classement
        const opponentRanking = match.rankings && match.rankings.opponent_ranking ? ` (${match.rankings.opponent_ranking})` : '';
        const opponentDisplay = `${opponent.name}${opponentRanking}`;

        row.innerHTML = `
            <td class="px-2 py-1 text-xs text-gray-900">${this.formatDate(match.date)}</td>
            <td class="px-2 py-1 text-xs text-gray-900">${tournamentDisplay}</td>
            <td class="px-2 py-1 text-xs text-gray-900">${match.tournament.type || 'N/A'}</td>
            <td class="px-2 py-1 text-xs">
                <span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full ${surfaceClass}">
                    ${match.tournament.surface || 'N/A'}
                </span>
            </td>
            <td class="px-2 py-1 text-xs text-gray-900">
                ${match.round.name || 'N/A'}
                ${match.round.is_qualifying ? '<span class="text-xs text-orange-600">(Q)</span>' : ''}
            </td>
            <td class="px-2 py-1 text-xs">
                <span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full ${resultClass}">
                    ${resultText}
                </span>
            </td>
            <td class="px-2 py-1 text-xs">
                <a href="/player-stats/${opponent.id}" class="text-blue-600 hover:text-blue-800 font-medium">
                    ${opponentDisplay}
                </a>
            </td>
            <td class="px-2 py-1 text-xs text-gray-900">
                ${match.result.score || 'N/A'}
                ${match.result.is_walkover ? '<span class="text-xs text-red-600">(W/O)</span>' : ''}
            </td>
            <td class="px-2 py-1 text-xs text-gray-600">
                ${match.odds.player_odds ? match.odds.player_odds.toFixed(2) : 'N/A'}
            </td>
            <td class="px-2 py-1 text-xs text-gray-600">
                ${match.odds.opponent_odds ? match.odds.opponent_odds.toFixed(2) : 'N/A'}
            </td>
        `;

        return row;
    }

    getSurfaceClass(surface) {
        if (!surface) return 'bg-gray-100 text-gray-800';

        const surfaceLower = surface.toLowerCase();
        if (surfaceLower.includes('clay')) return 'surface-clay';
        if (surfaceLower.includes('hard')) return 'surface-hard';
        if (surfaceLower.includes('grass')) return 'surface-grass';
        if (surfaceLower.includes('carpet')) return 'surface-carpet';
        if (surfaceLower.includes('indoor')) return 'surface-indoor';

        return 'bg-gray-100 text-gray-800';
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    updateMatchesCount(total) {
        const countElement = document.getElementById('matches-count');
        countElement.textContent = `${total} matchs au total`;
    }

    updatePagination(pagination) {
        const paginationElement = document.getElementById('pagination');
        const prevButton = document.getElementById('prev-page');
        const nextButton = document.getElementById('next-page');
        const paginationInfo = document.getElementById('pagination-info');

        if (pagination.total <= pagination.limit) {
            paginationElement.classList.add('hidden');
            return;
        }

        const start = pagination.offset + 1;
        const end = Math.min(pagination.offset + pagination.limit, pagination.total);

        paginationInfo.textContent = `Affichage de ${start} à ${end} sur ${pagination.total} matchs`;

        prevButton.disabled = this.currentPage === 0;
        nextButton.disabled = !pagination.has_more;

        paginationElement.classList.remove('hidden');
    }

    showMatchesLoading() {
        document.getElementById('matches-loading').classList.remove('hidden');
        document.getElementById('matches-container').classList.add('hidden');
        document.getElementById('no-matches').classList.add('hidden');
        document.getElementById('pagination').classList.add('hidden');
    }

    showMatches() {
        document.getElementById('matches-loading').classList.add('hidden');
        document.getElementById('matches-container').classList.remove('hidden');
        document.getElementById('no-matches').classList.add('hidden');
    }

    showNoMatches() {
        document.getElementById('matches-loading').classList.add('hidden');
        document.getElementById('matches-container').classList.add('hidden');
        document.getElementById('no-matches').classList.remove('hidden');
        document.getElementById('pagination').classList.add('hidden');
    }

    showError() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎾 Initialisation Player Stats...');
    new PlayerStats();
});