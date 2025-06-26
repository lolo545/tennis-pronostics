class CompleteStats {
    constructor() {
        this.currentTour = 'ATP';
        this.currentPage = 0;
        this.limit = 100;
        this.sortBy = 'current_ranking';
        this.sortOrder = 'ASC';
        this.data = null;

        this.initializeEventListeners();
        this.loadData();
    }

    initializeEventListeners() {
        // Tour selection
        document.getElementById('atp-btn').addEventListener('click', () => {
            this.switchTour('ATP');
        });

        document.getElementById('wta-btn').addEventListener('click', () => {
            this.switchTour('WTA');
        });

        // Controls
        document.getElementById('limit-select').addEventListener('change', (e) => {
            this.limit = parseInt(e.target.value);
            this.currentPage = 0;
            this.loadData();
        });

        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.sortBy = e.target.value;
            this.currentPage = 0;
            this.loadData();
        });

        document.getElementById('order-select').addEventListener('change', (e) => {
            this.sortOrder = e.target.value;
            this.currentPage = 0;
            this.loadData();
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadData();
        });

        // Pagination
        document.getElementById('prev-page').addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.loadData();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            this.currentPage++;
            this.loadData();
        });

        // Sortable headers
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                if (sortField) {
                    // Toggle order if same field
                    if (this.sortBy === sortField) {
                        this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
                    } else {
                        this.sortBy = sortField;
                        this.sortOrder = 'ASC';
                    }
                    
                    // Update controls
                    document.getElementById('sort-select').value = this.sortBy;
                    document.getElementById('order-select').value = this.sortOrder;
                    
                    this.currentPage = 0;
                    this.updateSortArrows();
                    this.loadData();
                }
            });
        });
    }

    switchTour(tour) {
        this.currentTour = tour;
        this.currentPage = 0;
        this.updateTourButtons();
        this.updateTableTitle();
        this.loadData();
    }

    updateTourButtons() {
        const atpBtn = document.getElementById('atp-btn');
        const wtaBtn = document.getElementById('wta-btn');
        
        if (this.currentTour === 'ATP') {
            atpBtn.className = 'px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold';
            wtaBtn.className = 'px-8 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors';
        } else {
            atpBtn.className = 'px-8 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors';
            wtaBtn.className = 'px-8 py-3 bg-pink-600 text-white rounded-lg font-semibold';
        }
    }

    updateTableTitle() {
        const title = document.getElementById('table-title');
        title.textContent = `Statistiques ${this.currentTour}`;
        title.className = this.currentTour === 'ATP' ? 
            'text-lg font-semibold text-blue-900' : 
            'text-lg font-semibold text-pink-900';
    }

    updateSortArrows() {
        document.querySelectorAll('.sort-arrow').forEach(arrow => {
            arrow.textContent = '↕';
        });
        
        const activeHeader = document.querySelector(`[data-sort="${this.sortBy}"] .sort-arrow`);
        if (activeHeader) {
            activeHeader.textContent = this.sortOrder === 'ASC' ? '↑' : '↓';
        }
    }

    async loadData() {
        this.showLoading();
        
        try {
            const offset = this.currentPage * this.limit;
            const url = `/api/v1/players/complete-stats?tour=${this.currentTour}&limit=${this.limit}&offset=${offset}&sort_by=${this.sortBy}&sort_order=${this.sortOrder}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Erreur ${response.status}: ${response.statusText}`);
            }
            
            this.data = await response.json();
            this.displayData();
            this.updateSummary();
            this.updatePagination();
            this.updateSortArrows();
            
        } catch (error) {
            console.error('Erreur chargement données:', error);
            this.showError(error.message);
        }
    }

    displayData() {
        const tbody = document.getElementById('players-tbody');
        tbody.innerHTML = '';
        
        if (!this.data.players || this.data.players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="px-4 py-8 text-center text-gray-500">Aucune donnée disponible</td></tr>';
            return;
        }
        
        this.data.players.forEach(player => {
            const row = this.createPlayerRow(player);
            tbody.appendChild(row);
        });
        
        this.showData();
    }

    createPlayerRow(player) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        // Classe de ranking
        let rankClass = '';
        if (player.ranking.position <= 10) {
            rankClass = 'rank-top10';
        } else if (player.ranking.position <= 50) {
            rankClass = 'rank-top50';
        } else if (player.ranking.position <= 100) {
            rankClass = 'rank-top100';
        }
        
        row.innerHTML = `
            <td class="px-4 py-3 text-sm font-medium text-center ${rankClass}">
                ${player.ranking.position}
            </td>
            <td class="px-4 py-3 text-sm">
                <div class="flex items-center">
                    <div class="flex-shrink-0 w-8 h-5 mr-3 rounded bg-gray-200 text-xs flex items-center justify-center font-bold">
                        ${player.country_code || '🌍'}
                    </div>
                    <div>
                        <div class="font-medium text-gray-900">
                            <a href="/player-stats/${player.player_id}" class="text-blue-600 hover:text-blue-800">
                                ${player.full_name}
                            </a>
                        </div>
                    </div>
                </div>
            </td>
            <td class="px-4 py-3 text-sm text-center font-medium text-gray-900">
                ${player.ranking.points?.toLocaleString() || 'N/A'}
            </td>
            <td class="px-4 py-3 text-sm text-center font-medium ${this.getEloClass(player.elo_ratings.general)}">
                ${player.elo_ratings.general || 'N/A'}
            </td>
            <td class="px-4 py-3 text-xs text-center text-gray-600">
                ${this.formatEloSurfaces(player.elo_ratings)}
            </td>
            <td class="px-4 py-3 text-sm text-center font-medium ${this.getGainClass(player.betting_gains.three_months)}">
                ${this.formatGain(player.betting_gains.three_months)}
            </td>
            <td class="px-4 py-3 text-sm text-center font-medium ${this.getGainClass(player.betting_gains.six_months)}">
                ${this.formatGain(player.betting_gains.six_months)}
            </td>
            <td class="px-4 py-3 text-sm text-center font-medium ${this.getGainClass(player.betting_gains.twelve_months)}">
                ${this.formatGain(player.betting_gains.twelve_months)}
            </td>
            <td class="px-4 py-3 text-sm text-center font-medium ${this.getGainClass(player.betting_gains.twenty_four_months)}">
                ${this.formatGain(player.betting_gains.twenty_four_months)}
            </td>
            <td class="px-4 py-3 text-sm text-center font-medium ${this.getGainClass(player.betting_gains.total)}">
                ${this.formatGain(player.betting_gains.total)}
            </td>
        `;
        
        return row;
    }

    formatEloSurfaces(eloRatings) {
        const surfaces = [];
        if (eloRatings.clay) surfaces.push(`C:${eloRatings.clay}`);
        if (eloRatings.grass) surfaces.push(`G:${eloRatings.grass}`);
        if (eloRatings.hard) surfaces.push(`H:${eloRatings.hard}`);
        if (eloRatings.indoor_hard) surfaces.push(`I:${eloRatings.indoor_hard}`);
        
        return surfaces.length > 0 ? surfaces.join('<br>') : 'N/A';
    }

    getEloClass(elo) {
        if (!elo) return '';
        if (elo >= 1800) return 'elo-high';
        if (elo >= 1600) return 'elo-medium';
        return 'elo-low';
    }

    getGainClass(gain) {
        if (gain > 0) return 'positive-gain';
        if (gain < 0) return 'negative-gain';
        return 'neutral-gain';
    }

    formatGain(gain) {
        if (gain === 0) return '0.00€';
        const sign = gain > 0 ? '+' : '';
        return `${sign}${gain.toFixed(2)}€`;
    }

    updateSummary() {
        if (!this.data.players || this.data.players.length === 0) {
            document.getElementById('stats-summary').classList.add('hidden');
            return;
        }
        
        const totalPlayers = this.data.metadata.total_players;
        const avgElo = Math.round(this.data.players.reduce((sum, p) => sum + (p.elo_ratings.general || 0), 0) / this.data.players.length);
        
        const gains = this.data.players.map(p => p.betting_gains.total).filter(g => g !== null);
        const bestGains = gains.length > 0 ? Math.max(...gains) : 0;
        const worstLosses = gains.length > 0 ? Math.min(...gains) : 0;
        
        document.getElementById('total-players').textContent = totalPlayers.toLocaleString();
        document.getElementById('avg-elo').textContent = avgElo || 'N/A';
        document.getElementById('best-gains').textContent = this.formatGain(bestGains);
        document.getElementById('worst-losses').textContent = this.formatGain(worstLosses);
        
        document.getElementById('stats-summary').classList.remove('hidden');
    }

    updatePagination() {
        const metadata = this.data.metadata;
        const start = metadata.offset + 1;
        const end = Math.min(metadata.offset + metadata.limit, metadata.total_players);
        
        document.getElementById('pagination-info').textContent = 
            `Affichage de ${start} à ${end} sur ${metadata.total_players.toLocaleString()} joueurs`;
        
        document.getElementById('prev-page').disabled = this.currentPage === 0;
        document.getElementById('next-page').disabled = !metadata.has_more;
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('data-container').classList.add('hidden');
        document.getElementById('stats-summary').classList.add('hidden');
    }

    showData() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('data-container').classList.remove('hidden');
    }

    showError(message) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('data-container').classList.add('hidden');
        document.getElementById('stats-summary').classList.add('hidden');
        document.getElementById('error-message').textContent = message;
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎾 Initialisation Complete Stats...');
    new CompleteStats();
});

// Drapeaux pour améliorer l'affichage
const countryFlags = {
    'FRA': '🇫🇷', 'ESP': '🇪🇸', 'USA': '🇺🇸', 'GBR': '🇬🇧',
    'ITA': '🇮🇹', 'GER': '🇩🇪', 'SUI': '🇨🇭', 'AUT': '🇦🇹',
    'SRB': '🇷🇸', 'GRE': '🇬🇷', 'RUS': '🇷🇺', 'NOR': '🇳🇴',
    'CAN': '🇨🇦', 'ARG': '🇦🇷', 'BRA': '🇧🇷', 'CHI': '🇨🇱',
    'JPN': '🇯🇵', 'CHN': '🇨🇳', 'KOR': '🇰🇷', 'AUS': '🇦🇺',
    'BEL': '🇧🇪', 'NED': '🇳🇱', 'DEN': '🇩🇰', 'SWE': '🇸🇪',
    'POL': '🇵🇱', 'CZE': '🇨🇿', 'CRO': '🇭🇷', 'UKR': '🇺🇦'
};

// Mettre à jour les drapeaux après chargement
function updateFlags() {
    document.querySelectorAll('.country-flag').forEach(flag => {
        const countryCode = flag.textContent.trim();
        if (countryFlags[countryCode]) {
            flag.textContent = countryFlags[countryCode];
        }
    });
}

// Observer pour les nouveaux éléments
const observer = new MutationObserver(updateFlags);
observer.observe(document.getElementById('players-tbody'), {
    childList: true,
    subtree: true
});