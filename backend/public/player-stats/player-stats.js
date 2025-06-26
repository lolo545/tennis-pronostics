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

        // Tabs pour les statistiques de cotes
        document.getElementById('tab-specific-ranges').addEventListener('click', () => {
            this.showOddsTab('specific-ranges');
        });

        document.getElementById('tab-deciles').addEventListener('click', () => {
            this.showOddsTab('deciles');
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
            this.loadEloStats();
            this.loadOddsStats();
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
                        <td class="px-1 py-0.5 text-xs text-center text-blue-600">${this.formatCompactStat(stat.main_draw.periods['3m'].wins, stat.main_draw.periods['3m'].matches, stat.main_draw.periods['3m'].win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-blue-600">${this.formatCompactStat(stat.main_draw.periods['6m'].wins, stat.main_draw.periods['6m'].matches, stat.main_draw.periods['6m'].win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-blue-600">${this.formatCompactStat(stat.main_draw.periods['12m'].wins, stat.main_draw.periods['12m'].matches, stat.main_draw.periods['12m'].win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-blue-600">${this.formatCompactStat(stat.main_draw.periods['24m'].wins, stat.main_draw.periods['24m'].matches, stat.main_draw.periods['24m'].win_percentage)}</td>
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
                        <td class="px-1 py-0.5 text-xs text-center text-orange-600">${this.formatCompactStat(stat.qualifying.periods['3m'].wins, stat.qualifying.periods['3m'].matches, stat.qualifying.periods['3m'].win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-orange-600">${this.formatCompactStat(stat.qualifying.periods['6m'].wins, stat.qualifying.periods['6m'].matches, stat.qualifying.periods['6m'].win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-orange-600">${this.formatCompactStat(stat.qualifying.periods['12m'].wins, stat.qualifying.periods['12m'].matches, stat.qualifying.periods['12m'].win_percentage)}</td>
                        <td class="px-1 py-0.5 text-xs text-center text-orange-600">${this.formatCompactStat(stat.qualifying.periods['24m'].wins, stat.qualifying.periods['24m'].matches, stat.qualifying.periods['24m'].win_percentage)}</td>
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

    async loadEloStats() {
        try {
            const response = await fetch(`/api/v1/players/${this.playerId}/elo-stats`);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erreur API elo stats:', response.status, errorData);
                throw new Error(`Erreur ${response.status}: ${errorData.message || 'Erreur lors du chargement des statistiques ELO'}`);
            }
            
            const data = await response.json();
            this.displayEloStats(data.elo_statistics);
            
        } catch (error) {
            console.error('Erreur chargement elo stats:', error);
            this.hideEloStatsLoading();
        }
    }

    displayEloStats(eloStats) {
        // Afficher les statistiques globales
        this.displayGlobalEloStats(eloStats.global);
        
        // Afficher les statistiques par tranches
        this.displayEloRangesStats(eloStats.by_ranges);
        
        // Afficher la section
        document.getElementById('elo-stats-loading').classList.add('hidden');
        document.getElementById('elo-stats').classList.remove('hidden');
    }

    displayGlobalEloStats(globalStats) {
        const container = document.getElementById('elo-global-stats');
        
        if (!globalStats || globalStats.total_matches_with_elo === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">Aucune donnée ELO disponible pour ce joueur.</p>';
            return;
        }

        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-900">${globalStats.total_matches_with_elo}</div>
                    <div class="text-xs text-gray-500">Matchs avec ELO</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-purple-600">${globalStats.overall_win_rate}%</div>
                    <div class="text-xs text-gray-500">% Victoires</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-600">${globalStats.avg_elo_difference >= 0 ? '+' : ''}${globalStats.avg_elo_difference}</div>
                    <div class="text-xs text-gray-500">Diff. ELO moyenne</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-600">${globalStats.avg_player_elo}</div>
                    <div class="text-xs text-gray-500">ELO moyen joueur</div>
                </div>
            </div>
            <div class="mt-3 pt-3 border-t border-purple-200">
                <div class="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div class="text-sm font-medium text-gray-700">Diff. minimale</div>
                        <div class="text-xs text-gray-600">${globalStats.min_elo_difference >= 0 ? '+' : ''}${globalStats.min_elo_difference}</div>
                    </div>
                    <div>
                        <div class="text-sm font-medium text-gray-700">Diff. maximale</div>
                        <div class="text-xs text-gray-600">${globalStats.max_elo_difference >= 0 ? '+' : ''}${globalStats.max_elo_difference}</div>
                    </div>
                    <div>
                        <div class="text-sm font-medium text-gray-700">ELO moyen adversaires</div>
                        <div class="text-xs text-gray-600">${globalStats.avg_opponent_elo}</div>
                    </div>
                </div>
            </div>
        `;
    }

    displayEloRangesStats(eloRanges) {
        const tbody = document.getElementById('elo-stats-tbody');
        tbody.innerHTML = '';
        
        if (!eloRanges || eloRanges.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-2 py-3 text-center text-gray-500 text-xs">Aucune donnée disponible</td></tr>';
            return;
        }

        eloRanges.forEach(stat => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            
            // Colorier selon la probabilité de victoire
            let rangeClass = 'text-gray-600';
            if (stat.elo_range.includes('5%') && !stat.elo_range.includes('15%')) {
                rangeClass = 'text-red-700'; // Très difficile
            } else if (stat.elo_range.includes('5-15%') || stat.elo_range.includes('15-25%') || stat.elo_range.includes('25-35%')) {
                rangeClass = 'text-red-600'; // Difficile
            } else if (stat.elo_range.includes('35-45%') || stat.elo_range.includes('45-55%')) {
                rangeClass = 'text-gray-700'; // Équilibré
            } else if (stat.elo_range.includes('55-65%') || stat.elo_range.includes('65-75%') || stat.elo_range.includes('75-85%')) {
                rangeClass = 'text-green-600'; // Favorable
            } else if (stat.elo_range.includes('85-95%') || stat.elo_range.includes('95%')) {
                rangeClass = 'text-green-700'; // Très favorable
            }

            row.innerHTML = `
                <td class="px-2 py-2 text-xs font-medium ${rangeClass}">${stat.elo_range}</td>
                <td class="px-2 py-2 text-xs text-center text-gray-700">${stat.total_matches}</td>
                <td class="px-2 py-2 text-xs text-center text-green-600">${stat.wins}</td>
                <td class="px-2 py-2 text-xs text-center font-medium text-purple-600">${stat.win_percentage}%</td>
                <td class="px-2 py-2 text-xs text-center text-gray-600">${stat.elo_difference_details.avg >= 0 ? '+' : ''}${stat.elo_difference_details.avg}</td>
                <td class="px-2 py-2 text-xs text-center text-gray-600">${stat.elo_difference_details.min >= 0 ? '+' : ''}${stat.elo_difference_details.min} / ${stat.elo_difference_details.max >= 0 ? '+' : ''}${stat.elo_difference_details.max}</td>
            `;
            tbody.appendChild(row);
        });
    }

    hideEloStatsLoading() {
        document.getElementById('elo-stats-loading').classList.add('hidden');
    }

    async loadOddsStats() {
        try {
            const response = await fetch(`/api/v1/players/${this.playerId}/odds-stats`);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erreur API odds stats:', response.status, errorData);
                throw new Error(`Erreur ${response.status}: ${errorData.message || 'Erreur lors du chargement des statistiques de cotes'}`);
            }
            
            const data = await response.json();
            this.displayOddsStats(data.odds_statistics);
            
        } catch (error) {
            console.error('Erreur chargement odds stats:', error);
            this.hideOddsStatsLoading();
        }
    }

    displayOddsStats(oddsStats) {
        // Afficher les statistiques globales
        this.displayGlobalOddsStats(oddsStats.global);
        
        // Afficher les statistiques par tranches spécifiques
        this.displaySpecificRangesStats(oddsStats.by_specific_ranges);
        
        // Afficher les statistiques par déciles
        this.displayDecilesStats(oddsStats.by_deciles);
        
        // Afficher la section
        document.getElementById('odds-stats-loading').classList.add('hidden');
        document.getElementById('odds-stats').classList.remove('hidden');
    }

    displayGlobalOddsStats(globalStats) {
        const container = document.getElementById('odds-global-stats');
        
        if (!globalStats || globalStats.total_matches_with_odds === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">Aucune donnée de cotes disponible pour ce joueur.</p>';
            return;
        }

        const outperformanceClass = globalStats.outperformance >= 0 ? 'text-green-600' : 'text-red-600';
        const outperformanceSign = globalStats.outperformance >= 0 ? '+' : '';

        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-900">${globalStats.total_matches_with_odds}</div>
                    <div class="text-xs text-gray-500">Matchs avec cotes</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-blue-600">${globalStats.overall_win_rate}%</div>
                    <div class="text-xs text-gray-500">% Victoires réel</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-600">${globalStats.avg_expected_win_rate}%</div>
                    <div class="text-xs text-gray-500">% Attendu (bookmakers)</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold ${outperformanceClass}">${outperformanceSign}${globalStats.outperformance}%</div>
                    <div class="text-xs text-gray-500">Efficacité vs cotes</div>
                </div>
            </div>
            <div class="mt-3 pt-3 border-t border-blue-200">
                <div class="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div class="text-sm font-medium text-gray-700">Meilleures cotes</div>
                        <div class="text-xs text-gray-600">${globalStats.best_odds_taken}</div>
                    </div>
                    <div>
                        <div class="text-sm font-medium text-gray-700">Cotes moyennes</div>
                        <div class="text-xs text-gray-600">${globalStats.avg_odds}</div>
                    </div>
                    <div>
                        <div class="text-sm font-medium text-gray-700">Pires cotes</div>
                        <div class="text-xs text-gray-600">${globalStats.worst_odds_taken}</div>
                    </div>
                </div>
            </div>
        `;
    }

    displaySpecificRangesStats(specificRanges) {
        const tbody = document.getElementById('odds-specific-ranges-tbody');
        tbody.innerHTML = '';
        
        if (!specificRanges || specificRanges.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-2 py-3 text-center text-gray-500 text-xs">Aucune donnée disponible</td></tr>';
            return;
        }

        specificRanges.forEach(stat => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            
            const efficiencyClass = stat.efficiency_difference >= 0 ? 'text-green-600' : 'text-red-600';
            const efficiencySign = stat.efficiency_difference >= 0 ? '+' : '';

            row.innerHTML = `
                <td class="px-2 py-2 text-xs font-medium text-gray-900">${stat.probability_range}</td>
                <td class="px-2 py-2 text-xs text-center text-gray-700">${stat.total_matches}</td>
                <td class="px-2 py-2 text-xs text-center text-green-600">${stat.wins}</td>
                <td class="px-2 py-2 text-xs text-center font-medium text-blue-600">${stat.win_percentage}%</td>
                <td class="px-2 py-2 text-xs text-center text-gray-600">${stat.expected_win_rate}%</td>
                <td class="px-2 py-2 text-xs text-center font-medium ${efficiencyClass}">${efficiencySign}${stat.efficiency_difference}%</td>
                <td class="px-2 py-2 text-xs text-center text-gray-600">${stat.odds_range.min} - ${stat.odds_range.max}</td>
            `;
            tbody.appendChild(row);
        });
    }

    displayDecilesStats(deciles) {
        const tbody = document.getElementById('odds-deciles-tbody');
        tbody.innerHTML = '';
        
        if (!deciles || deciles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-2 py-3 text-center text-gray-500 text-xs">Aucune donnée disponible</td></tr>';
            return;
        }

        deciles.forEach(stat => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';

            row.innerHTML = `
                <td class="px-2 py-2 text-xs font-medium text-gray-900">${stat.probability_range}</td>
                <td class="px-2 py-2 text-xs text-center text-gray-700">${stat.total_matches}</td>
                <td class="px-2 py-2 text-xs text-center text-green-600">${stat.wins}</td>
                <td class="px-2 py-2 text-xs text-center font-medium text-blue-600">${stat.win_percentage}%</td>
                <td class="px-2 py-2 text-xs text-center text-gray-600">${stat.expected_win_rate}%</td>
                <td class="px-2 py-2 text-xs text-center text-gray-600">${stat.odds_range.min} - ${stat.odds_range.max}</td>
            `;
            tbody.appendChild(row);
        });
    }

    showOddsTab(tabName) {
        // Mettre à jour les boutons
        document.getElementById('tab-specific-ranges').className = 
            'px-4 py-2 text-sm font-medium ' + 
            (tabName === 'specific-ranges' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700');
        
        document.getElementById('tab-deciles').className = 
            'px-4 py-2 text-sm font-medium ' + 
            (tabName === 'deciles' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700');

        // Afficher/masquer les contenus
        if (tabName === 'specific-ranges') {
            document.getElementById('odds-specific-ranges').classList.remove('hidden');
            document.getElementById('odds-deciles').classList.add('hidden');
        } else {
            document.getElementById('odds-specific-ranges').classList.add('hidden');
            document.getElementById('odds-deciles').classList.remove('hidden');
        }
    }

    hideOddsStatsLoading() {
        document.getElementById('odds-stats-loading').classList.add('hidden');
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