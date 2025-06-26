class TennisRankings {
    constructor() {
        this.apiBase = '/api/v1';
        this.currentTour = 'ATP';
        this.isDataLoaded = false;

        this.initializeEventListeners();
        this.loadInitialData();
    }

    initializeEventListeners() {
        document.getElementById('tour-select').addEventListener('change', (e) => {
            this.currentTour = e.target.value;
            this.loadHistoricalDates();
            this.updateTableTitle();
        });

        document.getElementById('load-btn').addEventListener('click', () => {
            this.loadRankings();
        });

        document.getElementById('country-filter').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadRankings();
            }
        });

        document.getElementById('limit-select').addEventListener('change', () => {
            if (this.isDataLoaded) {
                this.loadRankings();
            }
        });
    }

    async loadInitialData() {
        this.updateStatus('Chargement initial...', 'loading');
        await this.loadHistoricalDates();
        await this.loadRankings();
        this.isDataLoaded = true;
        this.updateStatus('Prêt', 'success');
    }

    async loadHistoricalDates() {
        try {
            const response = await fetch(`${this.apiBase}/rankings/historical?tour=${this.currentTour}`);
            const data = await response.json();

            const dateSelect = document.getElementById('date-select');
            dateSelect.innerHTML = '<option value="current">Classement actuel</option>';

            if (data.dates) {
                data.dates.forEach(dateInfo => {
                    const option = document.createElement('option');
                    option.value = dateInfo.date;
                    option.textContent = `${this.formatDate(dateInfo.date)} (${dateInfo.players_count} joueurs)`;
                    dateSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Erreur chargement dates:', error);
        }
    }

    async loadRankings() {
        this.showLoading();
        this.updateStatus('Chargement classement...', 'loading');

        try {
            const dateSelect = document.getElementById('date-select');
            const selectedDate = dateSelect.value;
            const country = document.getElementById('country-filter').value.trim();
            const limit = document.getElementById('limit-select').value;

            let url;
            if (selectedDate === 'current') {
                url = `${this.apiBase}/rankings/current?tour=${this.currentTour}&limit=${limit}`;
                if (country) {
                    url += `&country=${country}`;
                }
            } else {
                url = `${this.apiBase}/rankings/by-date?tour=${this.currentTour}&date=${selectedDate}&limit=${limit}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erreur lors du chargement');
            }

            this.displayRankings(data);
            this.displayMetadata(data.metadata);
            this.updateStatus(`${this.currentTour} chargé`, 'success');

        } catch (error) {
            this.showError(error.message);
            this.updateStatus('Erreur de chargement', 'error');
        }
    }

    displayRankings(data) {
        const tbody = document.getElementById('rankings-tbody');
        tbody.innerHTML = '';

        if (!data.rankings || data.rankings.length === 0) {
            this.showNoData();
            return;
        }

        data.rankings.forEach(ranking => {
            const row = document.createElement('tr');

            if (ranking.position <= 10) {
                row.classList.add('top-10');
            } else if (ranking.position <= 50) {
                row.classList.add('top-50');
            } else if (ranking.position <= 100) {
                row.classList.add('top-100');
            }

            row.innerHTML = `
                        <td class="position">${ranking.position}</td>
                        <td class="player-info">
                            <div class="flag" title="${ranking.player.country?.code || 'N/A'}">
                                ${ranking.player.country?.code || '🌍'}
                            </div>
                            <div>
                                <div class="player-name">
                                    <a href="/player-stats/${ranking.player.id}" class="player-link">
                                        ${ranking.player.full_name}
                                    </a>
                                </div>
                            </div>
                        </td>
                        <td class="points">${ranking.points?.toLocaleString() || 'N/A'}</td>
                        <td class="elo-rating">${ranking.elo_ratings?.general || 'N/A'}</td>
                        <td class="elo-surface">${this.formatEloSurfaces(ranking.elo_ratings)}</td>
                        <td class="progression">
                            ${this.formatProgression(ranking.progression)}
                        </td>
                    `;

            tbody.appendChild(row);
        });

        this.showTable();
    }

    displayMetadata(metadata) {
        document.getElementById('total-players').textContent =
            metadata.total_players?.toLocaleString() || '-';

        document.getElementById('ranking-date').textContent =
            this.formatDate(metadata.ranking_date) || '-';

        document.getElementById('tour-info').textContent = metadata.tour || '-';

        document.getElementById('ranking-info').style.display = 'flex';
    }

    formatEloSurfaces(eloRatings) {
        if (!eloRatings) return 'N/A';
        
        const surfaces = [];
        if (eloRatings.clay) surfaces.push(`C:${eloRatings.clay}`);
        if (eloRatings.grass) surfaces.push(`G:${eloRatings.grass}`);
        if (eloRatings.hard) surfaces.push(`H:${eloRatings.hard}`);
        if (eloRatings.indoor_hard) surfaces.push(`I:${eloRatings.indoor_hard}`);
        
        return surfaces.length > 0 ? surfaces.join('<br>') : 'N/A';
    }

    formatProgression(progression) {
        if (progression === null || progression === undefined) {
            return '<span class="progression stable">-</span>';
        }

        if (progression > 0) {
            return `<span class="progression up">
                        <span class="progression-arrow">↗</span>+${progression}
                    </span>`;
        } else if (progression < 0) {
            return `<span class="progression down">
                        <span class="progression-arrow">↘</span>${progression}
                    </span>`;
        } else {
            return '<span class="progression stable">⚬ =</span>';
        }
    }

    formatDate(dateString) {
        if (!dateString) return '-';

        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    updateTableTitle() {
        const title = this.currentTour === 'ATP' ? 'Classement ATP' : 'Classement WTA';
        document.getElementById('table-title').textContent = title;
    }

    updateStatus(message, type) {
        const statusEl = document.getElementById('status-indicator');
        statusEl.textContent = message;
        statusEl.className = `status-indicator ${type}`;
    }

    showLoading() {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('error').style.display = 'none';
        document.getElementById('rankings-table').style.display = 'none';
        document.getElementById('no-data').style.display = 'none';
    }

    showTable() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('rankings-table').style.display = 'table';
        document.getElementById('no-data').style.display = 'none';
    }

    showError(message) {
        document.getElementById('error').textContent = message;
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('rankings-table').style.display = 'none';
        document.getElementById('no-data').style.display = 'none';
    }

    showNoData() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('rankings-table').style.display = 'none';
        document.getElementById('no-data').style.display = 'block';
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎾 Initialisation Tennis Rankings...');
    new TennisRankings();
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

function updateFlags() {
    document.querySelectorAll('.flag').forEach(flag => {
        const countryCode = flag.getAttribute('title');
        if (countryFlags[countryCode]) {
            flag.textContent = countryFlags[countryCode];
            flag.style.fontSize = '16px';
        }
    });
}
/*
const observer = new MutationObserver(updateFlags);
observer.observe(document.getElementById('rankings-tbody'), {
    childList: true,
    subtree: true
});*/