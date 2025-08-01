app.get("/api/search", async(req, res) => {
    try {
        const searchQuery = (req.query.q || "").trim();
        const category = req.query.category;
        const limit = 5;
        const escapedSearch = escapeRegExp(searchQuery);

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

        const movies = await Movie.find(searchFilter)
            .sort({ createdAt: -1 })
            .limit(limit);

        const results = movies.map(movie => ({
            title: movie.title,
            year: movie.year,
            genre: movie.genre,
            poster: movie.poster, // ✅ Include poster
            downloadLink: `/download/${movie.slug}` // Or full URL
        }));

        res.json(results);
    } catch (err) {
        console.error("❌ API Search Error:", err);
        res.status(500).json({ error: "Search failed" });
    }
});