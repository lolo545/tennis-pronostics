class TournamentResults {
    constructor() {
        this.selectedTournament = null;
        this.currentPage = 0;
        this.limit = 100;
        this.filters = {
            round: '',
            player: ''
        };

        this.initializeEventListeners();
        this.setCurrentYear();
        this.loadUrlParameters();
    }

    setCurrentYear() {
        const currentYear = new Date().getFullYear();
        document.getElementById('tournament-year').value = currentYear;
    }

    loadUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Pré-remplir les champs depuis l'URL
        const searchParam = urlParams.get('search');
        const yearParam = urlParams.get('year');
        const tourParam = urlParams.get('tour');
        
        if (searchParam) {
            document.getElementById('tournament-name').value = searchParam;
        }
        
        if (yearParam) {
            document.getElementById('tournament-year').value = yearParam;
        }
        
        if (tourParam) {
            document.getElementById('tournament-tour').value = tourParam;
        }
        
        // Si des paramètres sont présents, lancer automatiquement la recherche
        if (searchParam || yearParam || tourParam) {
            // Utiliser setTimeout pour s'assurer que les event listeners sont initialisés
            setTimeout(() => {
                this.searchTournaments();
            }, 100);
        }
    }

    initializeEventListeners() {
        // Recherche de tournois
        document.getElementById('search-tournaments').addEventListener('click', () => {
            this.searchTournaments();
        });

        // Recherche au clavier (Enter)
        ['tournament-name', 'tournament-year'].forEach(id => {
            document.getElementById(id).addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchTournaments();
                }
            });
        });

        // Pagination des matchs
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

        // Filtres des matchs
        ['round', 'player'].forEach(filterId => {
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
        document.getElementById('clear-match-filters').addEventListener('click', () => {
            this.clearMatchFilters();
        });

        // Retry button
        document.getElementById('retry-button').addEventListener('click', () => {
            this.hideError();
            if (this.selectedTournament) {
                this.loadMatches();
            }
        });
    }

    async searchTournaments() {
        const name = document.getElementById('tournament-name').value.trim();
        const year = document.getElementById('tournament-year').value.trim();
        const tour = document.getElementById('tournament-tour').value;

        if (!name && !year && !tour) {
            this.showError('Veuillez saisir au moins un critère de recherche (nom, année ou circuit).');
            return;
        }

        this.showSearchLoading();

        try {
            let url = '/api/v1/tournaments/search?';
            const params = [];

            if (name) params.push(`name=${encodeURIComponent(name)}`);
            if (year) params.push(`year=${encodeURIComponent(year)}`);
            if (tour) params.push(`tour=${encodeURIComponent(tour)}`);

            url += params.join('&');

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error('Erreur lors de la recherche des tournois');
            }

            const data = await response.json();
            this.displayTournamentResults(data.tournaments);

        } catch (error) {
            console.error('Erreur recherche tournois:', error);
            this.showError('Erreur lors de la recherche des tournois. Veuillez réessayer.');
        } finally {
            this.hideSearchLoading();
        }
    }

    displayTournamentResults(tournaments) {
        const resultsContainer = document.getElementById('tournament-search-results');
        const tournamentsList = document.getElementById('tournaments-list');

        if (tournaments.length === 0) {
            tournamentsList.innerHTML = '<p class="text-gray-500 text-center py-4">Aucun tournoi trouvé pour ces critères.</p>';
        } else {
            tournamentsList.innerHTML = tournaments.map(tournament => `
                <div class="tournament-item p-3 border rounded-md hover:bg-blue-50 cursor-pointer transition-colors"
                     data-tournament-id="${tournament.id}"
                     onclick="tournamentResults.selectTournament(${tournament.id})">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-medium text-gray-900">${tournament.name}</h4>
                            <p class="text-sm text-gray-600">
                                ${tournament.year} • ${tournament.tour} • ${tournament.type || 'N/A'}
                                ${tournament.country ? `• ${tournament.country}` : ''}
                            </p>
                            <p class="text-xs text-gray-500">
                                ${tournament.surface || 'Surface N/A'} • ${tournament.match_count} matchs
                            </p>
                        </div>
                        <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${this.getTourBadgeClass(tournament.tour)}">
                            ${tournament.tour}
                        </span>
                    </div>
                </div>
            `).join('');
        }

        resultsContainer.classList.remove('hidden');
    }

    getTourBadgeClass(tour) {
        if (tour === 'ATP') return 'bg-blue-100 text-blue-800';
        if (tour === 'WTA') return 'bg-pink-100 text-pink-800';
        return 'bg-gray-100 text-gray-800';
    }

    async selectTournament(tournamentId) {
        try {
            // Charger les informations du tournoi
            const response = await fetch(`/api/v1/tournaments/${tournamentId}`);

            if (!response.ok) {
                throw new Error('Erreur lors du chargement du tournoi');
            }

            this.selectedTournament = await response.json();
            this.displayTournamentInfo(this.selectedTournament);
            this.showMatchesSection();
            this.currentPage = 0;
            this.loadMatches();

            // Cacher les résultats de recherche
            document.getElementById('tournament-search-results').classList.add('hidden');
            document.getElementById('initial-message').classList.add('hidden');

        } catch (error) {
            console.error('Erreur sélection tournoi:', error);
            this.showError('Erreur lors du chargement du tournoi sélectionné.');
        }
    }

    displayTournamentInfo(tournament) {
        // Nom du tournoi
        document.getElementById('selected-tournament-name').textContent = tournament.name;

        // Détails du tournoi
        let details = `${tournament.tour} • ${tournament.year}`;
        if (tournament.type) details += ` • ${tournament.type}`;
        if (tournament.country) details += ` • ${tournament.country}`;
        document.getElementById('selected-tournament-details').textContent = details;

        // Badge du tournoi
        const badge = document.getElementById('tournament-badge');
        badge.innerHTML = `
            <div class="text-right">
                <div class="text-2xl font-bold ${tournament.tour === 'ATP' ? 'text-blue-600' : 'text-pink-600'}">${tournament.tour}</div>
                <div class="text-sm text-gray-500">${tournament.surface || 'Surface N/A'}</div>
            </div>
        `;

        // Statistiques rapides
        const stats = tournament.statistics;
        document.getElementById('tournament-stats').innerHTML = `
            <div class="text-center">
                <div class="text-2xl font-bold text-gray-900">${stats.total_matches}</div>
                <div class="text-sm text-gray-500">Matchs</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-bold text-blue-600">${stats.total_players}</div>
                <div class="text-sm text-gray-500">Joueurs</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-bold text-green-600">${this.formatDate(stats.first_match_date)}</div>
                <div class="text-sm text-gray-500">Premier match</div>
            </div>
            <div class="text-center">
                <div class="text-2xl font-bold text-orange-600">${this.formatDate(stats.last_match_date)}</div>
                <div class="text-sm text-gray-500">Dernier match</div>
            </div>
        `;

        // Afficher la section
        document.getElementById('tournament-info').classList.remove('hidden');
    }

    showMatchesSection() {
        document.getElementById('matches-section').classList.remove('hidden');
        document.getElementById('match-filters').classList.remove('hidden');
    }

    async loadMatches() {
        if (!this.selectedTournament) return;

        this.showMatchesLoading();

        try {
            const offset = this.currentPage * this.limit;
            let url = `/api/v1/tournaments/${this.selectedTournament.id}/matches?limit=${this.limit}&offset=${offset}`;

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

        // Surface
        const surfaceClass = this.getSurfaceClass(match.tournament.surface);

        // Round
        const roundClass = this.getRoundClass(match.round.name);

        // Formatage du nom du tournoi avec pays
        const tournamentDisplay = match.tournament.name
            ? `${match.tournament.name}${match.tournament.country ? ` (${match.tournament.country})` : ''}`
            : 'N/A';

        // Formatage des noms avec classements
        const winnerDisplay = `${match.winner.name}${match.winner.ranking ? ` (${match.winner.ranking})` : ''}`;
        const loserDisplay = `${match.loser.name}${match.loser.ranking ? ` (${match.loser.ranking})` : ''}`;

        row.innerHTML = `
            <td class="px-2 py-1 text-xs text-gray-900">${this.formatDate(match.date)}</td>
            <td class="px-2 py-1 text-xs text-gray-900">${tournamentDisplay}</td>
            <td class="px-2 py-1 text-xs text-gray-900">${match.tournament.type || 'N/A'}</td>
            <td class="px-2 py-1 text-xs">
                <span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full ${surfaceClass}">
                    ${match.tournament.surface || 'N/A'}
                </span>
            </td>
            <td class="px-2 py-1 text-xs">
                <span class="inline-flex px-1 py-0.5 text-xs font-medium rounded-full ${roundClass}">
                    ${match.round.name || 'N/A'}
                    ${match.round.is_qualifying ? ' (Q)' : ''}
                </span>
            </td>
            <td class="px-2 py-1 text-xs">
                <a href="/player-stats/${match.winner.id}" class="text-blue-600 hover:text-blue-800 font-medium">
                    ${match.winner.name}
                </a>
            </td>
            <td class="px-2 py-1 text-xs text-gray-700 font-medium">
                ${match.winner.ranking ? `N°${match.winner.ranking}` : 'NC'}
            </td>
            <td class="px-2 py-1 text-xs">
                <a href="/player-stats/${match.loser.id}" class="text-blue-600 hover:text-blue-800 font-medium">
                    ${match.loser.name}
                </a>
            </td>
            <td class="px-2 py-1 text-xs text-gray-700 font-medium">
                ${match.loser.ranking ? `N°${match.loser.ranking}` : 'NC'}
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

    getRoundClass(roundName) {
        if (!roundName) return 'bg-gray-100 text-gray-800';

        const roundLower = roundName.toLowerCase();
        if (roundLower.includes('final') && !roundLower.includes('semi')) return 'round-final';
        if (roundLower.includes('semi') || roundLower.includes('sf')) return 'round-sf';
        if (roundLower.includes('quarter') || roundLower.includes('qf')) return 'round-qf';
        if (roundLower.includes('qualif') || roundLower.includes('q1') || roundLower.includes('q2') || roundLower.includes('q3')) return 'round-qualifying';

        return 'bg-blue-100 text-blue-800';
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

    // Loading states
    showSearchLoading() {
        document.getElementById('search-loading').classList.remove('hidden');
        document.getElementById('tournament-search-results').classList.add('hidden');
    }

    hideSearchLoading() {
        document.getElementById('search-loading').classList.add('hidden');
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

    // Error handling
    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('initial-message').classList.add('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
        if (!this.selectedTournament) {
            document.getElementById('initial-message').classList.remove('hidden');
        }
    }

    clearMatchFilters() {
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

// Créer une instance globale
let tournamentResults;

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎾 Initialisation Tournament Results...');
    tournamentResults = new TournamentResults();
});