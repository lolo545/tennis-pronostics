class PlayerStats {
    constructor() {
        this.playerId = this.getPlayerIdFromUrl();
        this.currentPage = 0;
        this.limit = 100;
        this.playerData = null;
        this.filters = {
            tournament: '',
            type: '',
            surface: '',
            round: '',
            opponent: ''
        };

        this.initializeEventListeners();
        this.loadTournamentTypes();
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

        // Filtres
        const filterInputs = ['tournament', 'type', 'surface', 'round', 'opponent'];
        filterInputs.forEach(filterId => {
            const element = document.getElementById(`filter-${filterId}`);
            if (element) {
                element.addEventListener('input', () => {
                    this.filters[filterId] = element.value.trim();
                    this.currentPage = 0; // Reset to first page
                    this.loadMatches();
                });
            }
        });

        // Clear filters button
        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearFilters();
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
            this.loadPlayerStats();
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

            // Add filter parameters
            const activeFilters = Object.entries(this.filters)
                .filter(([key, value]) => value && value.length > 0)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
            
            if (activeFilters.length > 0) {
                url += '&' + activeFilters.join('&');
            }

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

        // Déterminer si le joueur consulté a gagné ce match
        const isWinner = match.result.player_result === 'WON';

        // Surface
        const surfaceClass = this.getSurfaceClass(match.tournament.surface);

        // Formatage du nom du tournoi avec pays
        const tournamentDisplay = match.tournament.name
            ? `${match.tournament.name}${match.tournament.country ? ` (${match.tournament.country})` : ''}`
            : 'N/A';

        // Informations du vainqueur et du perdant
        const winner = match.result.winner;
        const loser = match.result.loser;
        
        const winnerRanking = match.result.winner.ranking 
            ? `N°${match.result.winner.ranking}` 
            : 'NC';
            
        const loserRanking = match.result.loser.ranking 
            ? `N°${match.result.loser.ranking}` 
            : 'NC';

        // Déterminer si c'est un match de qualification
        const isQualification = match.round.is_qualification_match;
        const qualificationBadge = isQualification 
            ? '<span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-800">Q</span>'
            : '<span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">T</span>';

        row.innerHTML = `
            <td class="px-2 py-1 text-xs text-gray-900">${this.formatDate(match.date)}</td>
            <td class="px-2 py-1 text-xs">
                <a href="/tournament-results?search=${encodeURIComponent(match.tournament.name)}&year=${new Date(match.date).getFullYear()}" 
                   class="text-blue-600 hover:text-blue-800" title="Voir tous les matchs de ce tournoi">
                    ${tournamentDisplay}
                </a>
            </td>
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
            <td class="px-2 py-1 text-xs text-center">
                ${qualificationBadge}
            </td>
            <td class="px-2 py-1 text-xs">
                <a href="/player-stats/${winner.id}" class="text-blue-600 hover:text-blue-800 font-medium">
                    ${winner.name}
                </a>
                ${isWinner ? '<span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 ml-1">V</span>' : ''}
            </td>
            <td class="px-2 py-1 text-xs text-gray-700 font-medium">
                ${winnerRanking}
            </td>
            <td class="px-2 py-1 text-xs">
                <a href="/player-stats/${loser.id}" class="text-blue-600 hover:text-blue-800 font-medium">
                    ${loser.name}
                </a>
                ${!isWinner ? '<span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 ml-1">D</span>' : ''}
            </td>
            <td class="px-2 py-1 text-xs text-gray-700 font-medium">
                ${loserRanking}
            </td>
            <td class="px-2 py-1 text-xs text-gray-900">
                ${match.result.score || 'N/A'}
                ${match.result.is_walkover ? '<span class="text-xs text-red-600">(W/O)</span>' : ''}
            </td>
            <td class="px-2 py-1 text-xs text-gray-600">
                ${match.odds.winner_odds ? match.odds.winner_odds.toFixed(2) : 'N/A'}
            </td>
            <td class="px-2 py-1 text-xs text-gray-600">
                ${match.odds.loser_odds ? match.odds.loser_odds.toFixed(2) : 'N/A'}
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

    async loadTournamentTypes() {
        try {
            const response = await fetch('/api/v1/players/tournament-types');
            
            if (response.ok) {
                const data = await response.json();
                const typeSelect = document.getElementById('filter-type');
                
                // Vider le select et garder l'option par defaut
                typeSelect.innerHTML = '<option value="">Tous les types</option>';
                
                // Ajouter les types de tournoi
                data.tournament_types.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type;
                    option.textContent = type;
                    typeSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Erreur lors du chargement des types de tournoi:', error);
        }
    }

    async loadPlayerStats() {
        try {
            const response = await fetch(`/api/v1/players/${this.playerId}/stats`);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erreur API stats:', response.status, errorData);
                throw new Error(`Erreur ${response.status}: ${errorData.message || 'Erreur lors du chargement des statistiques'}`);
            }
            
            const data = await response.json();
            this.displayPlayerStats(data.statistics);
            
        } catch (error) {
            console.error('Erreur chargement stats:', error);
            this.hideStatsLoading();
        }
    }

    displayPlayerStats(stats) {
        // Afficher les stats par type
        this.displayStatsByType(stats.by_tournament_type);
        
        // Afficher les stats par surface
        this.displayStatsBySurface(stats.by_surface);
    }

    formatCompactStat(wins, matches, winPercentage) {
        if (matches === 0) return '-';
        return `${wins}/${matches} (${winPercentage}%)`;
    }

    displayStatsByType(statsByType) {
        const tbody = document.getElementById('stats-by-type-tbody');
        tbody.innerHTML = '';
        
        if (!statsByType || statsByType.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-2 py-3 text-center text-gray-500 text-xs">Aucune donnée disponible</td></tr>';
        } else {
            statsByType.forEach(stat => {
                // Ligne principale pour le type de tournoi
                const mainRow = document.createElement('tr');
                mainRow.className = 'hover:bg-gray-50 border-b-2 border-gray-200';
                mainRow.innerHTML = `
                    <td class="px-2 py-1 text-xs font-bold text-gray-900">${stat.tournament_type}</td>
                    <td class="px-1 py-1 text-xs text-center font-bold text-gray-700">${this.formatCompactStat(stat.total.wins, stat.total.matches, stat.total.win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['3m'].wins, stat.periods['3m'].matches, stat.periods['3m'].win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['6m'].wins, stat.periods['6m'].matches, stat.periods['6m'].win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['12m'].wins, stat.periods['12m'].matches, stat.periods['12m'].win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['24m'].wins, stat.periods['24m'].matches, stat.periods['24m'].win_percentage)}</td>
                `;
                tbody.appendChild(mainRow);

                // Sous-ligne pour le tableau principal (si il y a des matchs)
                if (stat.main_draw.matches > 0) {
                    const mainDrawRow = document.createElement('tr');
                    mainDrawRow.className = 'hover:bg-gray-50 bg-blue-50';
                    mainDrawRow.innerHTML = `
                        <td class="px-2 py-0.5 text-xs text-gray-600 pl-4">→ dont tour principal</td>
                        <td class="px-1 py-0.5 text-xs text-center text-blue-600">${this.formatCompactStat(stat.main_draw.wins, stat.main_draw.matches, stat.main_draw.win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                    `;
                    tbody.appendChild(mainDrawRow);
                }

                // Sous-ligne pour les qualifications (si il y a des matchs)
                if (stat.qualifying.matches > 0) {
                    const qualifyingRow = document.createElement('tr');
                    qualifyingRow.className = 'hover:bg-gray-50 bg-orange-50';
                    qualifyingRow.innerHTML = `
                        <td class="px-2 py-0.5 text-xs text-gray-600 pl-4">→ dont qualifications</td>
                        <td class="px-1 py-0.5 text-xs text-center text-orange-600">${this.formatCompactStat(stat.qualifying.wins, stat.qualifying.matches, stat.qualifying.win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                        <td class="px-1 py-0.5 text-xs text-center text-gray-400">-</td>
                    `;
                    tbody.appendChild(qualifyingRow);
                }
            });
        }
        
        document.getElementById('stats-by-type-loading').classList.add('hidden');
        document.getElementById('stats-by-type').classList.remove('hidden');
    }

    formatBestWorst(bestWin, worstLoss) {
        const best = bestWin ? `${bestWin.opponent_name} (${bestWin.opponent_ranking})` : 'N/A';
        const worst = worstLoss ? `${worstLoss.opponent_name} (${worstLoss.opponent_ranking})` : 'N/A';
        return `<div class="text-green-700">${best}</div><div class="text-red-700">${worst}</div>`;
    }

    displayStatsBySurface(statsBySurface) {
        const tbody = document.getElementById('stats-by-surface-tbody');
        tbody.innerHTML = '';
        
        if (!statsBySurface || statsBySurface.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-2 py-3 text-center text-gray-500 text-xs">Aucune donnée disponible</td></tr>';
        } else {
            statsBySurface.forEach(stat => {
                // Ligne principale avec les statistiques
                const mainRow = document.createElement('tr');
                mainRow.className = 'hover:bg-gray-50 border-b-2 border-gray-200';
                const surfaceClass = this.getSurfaceClass(stat.surface);
                
                mainRow.innerHTML = `
                    <td class="px-2 py-1 text-xs font-bold">
                        <span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full ${surfaceClass}">
                            ${stat.surface}
                        </span>
                    </td>
                    <td class="px-1 py-1 text-xs text-center font-bold text-gray-700">${this.formatCompactStat(stat.total.wins, stat.total.matches, stat.total.win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['3m'].wins, stat.periods['3m'].matches, stat.periods['3m'].win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['6m'].wins, stat.periods['6m'].matches, stat.periods['6m'].win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['12m'].wins, stat.periods['12m'].matches, stat.periods['12m'].win_percentage)}</td>
                    <td class="px-1 py-1 text-xs text-center text-gray-600">${this.formatCompactStat(stat.periods['24m'].wins, stat.periods['24m'].matches, stat.periods['24m'].win_percentage)}</td>
                `;
                tbody.appendChild(mainRow);

                // Ligne des meilleures victoires
                const bestWinRow = document.createElement('tr');
                bestWinRow.className = 'hover:bg-gray-50 bg-green-50';
                bestWinRow.innerHTML = `
                    <td class="px-2 py-0.5 text-xs text-gray-600 pl-4">→ Meilleures victoires</td>
                    <td class="px-1 py-0.5 text-xs text-center text-green-700">${stat.total.best_win ? `${stat.total.best_win.opponent_name} (${stat.total.best_win.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-green-700">${stat.periods['3m'].best_win ? `${stat.periods['3m'].best_win.opponent_name} (${stat.periods['3m'].best_win.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-green-700">${stat.periods['6m'].best_win ? `${stat.periods['6m'].best_win.opponent_name} (${stat.periods['6m'].best_win.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-green-700">${stat.periods['12m'].best_win ? `${stat.periods['12m'].best_win.opponent_name} (${stat.periods['12m'].best_win.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-green-700">${stat.periods['24m'].best_win ? `${stat.periods['24m'].best_win.opponent_name} (${stat.periods['24m'].best_win.opponent_ranking})` : 'N/A'}</td>
                `;
                tbody.appendChild(bestWinRow);

                // Ligne des pires défaites
                const worstLossRow = document.createElement('tr');
                worstLossRow.className = 'hover:bg-gray-50 bg-red-50';
                worstLossRow.innerHTML = `
                    <td class="px-2 py-0.5 text-xs text-gray-600 pl-4">→ Pires défaites</td>
                    <td class="px-1 py-0.5 text-xs text-center text-red-700">${stat.total.worst_loss ? `${stat.total.worst_loss.opponent_name} (${stat.total.worst_loss.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-red-700">${stat.periods['3m'].worst_loss ? `${stat.periods['3m'].worst_loss.opponent_name} (${stat.periods['3m'].worst_loss.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-red-700">${stat.periods['6m'].worst_loss ? `${stat.periods['6m'].worst_loss.opponent_name} (${stat.periods['6m'].worst_loss.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-red-700">${stat.periods['12m'].worst_loss ? `${stat.periods['12m'].worst_loss.opponent_name} (${stat.periods['12m'].worst_loss.opponent_ranking})` : 'N/A'}</td>
                    <td class="px-1 py-0.5 text-xs text-center text-red-700">${stat.periods['24m'].worst_loss ? `${stat.periods['24m'].worst_loss.opponent_name} (${stat.periods['24m'].worst_loss.opponent_ranking})` : 'N/A'}</td>
                `;
                tbody.appendChild(worstLossRow);
            });
        }
        
        document.getElementById('stats-by-surface-loading').classList.add('hidden');
        document.getElementById('stats-by-surface').classList.remove('hidden');
    }

    hideStatsLoading() {
        document.getElementById('stats-by-type-loading').classList.add('hidden');
        document.getElementById('stats-by-surface-loading').classList.add('hidden');
    }

    clearFilters() {
        // Reset filter values
        Object.keys(this.filters).forEach(key => {
            this.filters[key] = '';
            const element = document.getElementById(`filter-${key}`);
            if (element) {
                element.value = '';
            }
        });
        
        // Reset page and reload matches
        this.currentPage = 0;
        this.loadMatches();
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎾 Initialisation Player Stats...');
    new PlayerStats();
});