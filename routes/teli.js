// routes/teli.js - Enhanced version with offline support
import { loadMovies } from '../utils/loadMovies.js';

app.get("/api/search", async(req, res) => {
    try {
        const searchQuery = (req.query.q || "").trim();
        const category = req.query.category;
        const limit = parseInt(req.query.limit) || 5;

        if (!searchQuery) {
            return res.json([]);
        }

        const escapedSearch = escapeRegExp(searchQuery);
        let movies = [];

        try {
            // Try MongoDB first
            if (mongoose.connection.readyState === 1) {
                console.log('🔍 Searching MongoDB...');

                const searchFilter = {
                    $or: [
                        { title: { $regex: escapedSearch, $options: "i" } },
                        { description: { $regex: escapedSearch, $options: "i" } },
                        { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                        { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                    ]
                };

                if (category && category !== "All Movies") {
                    searchFilter.genre = { $regex: category, $options: "i" };
                }

                movies = await Movie.find(searchFilter)
                    .sort({ createdAt: -1 })
                    .limit(limit);

                console.log(`✅ Found ${movies.length} movies from MongoDB`);
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (mongoErr) {
            console.warn('⚠️ MongoDB search failed. Using offline search...');

            // Fallback to offline search
            const allMovies = await loadMovies();

            movies = allMovies.filter(movie => {
                const searchRegex = new RegExp(escapedSearch, 'i');

                const matchesSearch = (
                    searchRegex.test(movie.title || '') ||
                    searchRegex.test(movie.description || '') ||
                    (movie.cast && movie.cast.some(actor => searchRegex.test(actor))) ||
                    (movie.genre && movie.genre.some(g => searchRegex.test(g)))
                );

                const matchesCategory = !category ||
                    category === "All Movies" ||
                    (movie.genre && movie.genre.some(g =>
                        new RegExp(category, 'i').test(g)
                    ));

                return matchesSearch && matchesCategory;
            }).slice(0, limit);

            console.log(`📁 Found ${movies.length} movies from offline backup`);
        }

        const results = movies.map(movie => ({
            title: movie.title,
            year: movie.year,
            genre: Array.isArray(movie.genre) ? movie.genre : [movie.genre],
            poster: movie.poster,
            downloadLink: `/download/${movie.slug}`,
            description: movie.description ? movie.description.substring(0, 150) + '...' : '',
            cast: Array.isArray(movie.cast) ? movie.cast.slice(0, 3) : []
        }));

        res.json(results);

    } catch (err) {
        console.error("❌ API Search Error:", err);
        res.status(500).json({
            error: "Search failed",
            message: err.message,
            offline: mongoose.connection.readyState !== 1
        });
    }
});

// Helper function for escaping regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}