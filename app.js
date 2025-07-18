// app.js
import express from "express";
import mongoose from "mongoose";
import path from "path";
import bodyParser from "body-parser";
import lodash from "lodash";
import Movie from "./models/movies.js";
import adminAuth from "./middleware/adminAuth.js";

const { escapeRegExp } = lodash;
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

// Middleware Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(adminAuth); // Sets res.locals.isAdmin




// MongoDB Connection
mongoose
    .connect(
        process.env.MONGO_URL ||
        "mongodb+srv://deloarhossen:8PwxJE5xWkALIPK@watchview.x1xjpmm.mongodb.net/watchview?retryWrites=true&w=majority&appName=watchview"
    )
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Error:", err));

// Homepage with Smart Search
app.get("/", async(req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 14;
        const searchQuery = (req.query.search || "").trim();
        const category = req.query.category;

        let movies = [];
        let totalMovies = 0;

        if (searchQuery) {
            const escapedSearch = escapeRegExp(searchQuery);

            const startsWithMatches = await Movie.find({
                title: { $regex: "^" + escapedSearch, $options: "i" },
                ...(category && category !== "All Movies" && {
                    genre: { $regex: category, $options: "i" },
                }),
            });

            const containsMatches = await Movie.find({
                title: { $regex: escapedSearch, $options: "i" },
                _id: { $nin: startsWithMatches.map((m) => m._id) },
                ...(category && category !== "All Movies" && {
                    genre: { $regex: category, $options: "i" },
                }),
            });

            const combinedResults = [...startsWithMatches, ...containsMatches];
            totalMovies = combinedResults.length;
            movies = combinedResults.slice((page - 1) * limit, page * limit);
        } else {
            const query = {};
            if (category && category !== "All Movies") {
                query.genre = { $regex: category, $options: "i" };
            }

            totalMovies = await Movie.countDocuments(query);
            movies = await Movie.find(query)
                .sort({ title: 1 })
                .skip((page - 1) * limit)
                .limit(limit);
        }

        const totalPages = Math.ceil(totalMovies / limit);
        const trendingMovies = !searchQuery && !category ?
            await Movie.find().sort({ createdAt: -1 }).limit(4) : [];

        res.render("home", {
            movies,
            trendingMovies,
            currentPage: page,
            totalPages,
            searchQuery,
            category,
            isAdmin: res.locals.isAdmin,
        });
    } catch (err) {
        console.error("❌ Error loading homepage:", err);
        res.status(500).send("Error loading homepage");
    }
});

// Dummy Seeder
app.get("/seed", async(req, res) => {
    await Movie.create({
        title: "Pushpa 2",
        description: "Pushpa returns with more action and drama!",
        cast: ["Allu Arjun"],
        genre: ["South Hindi Dubbed", "Action"],
        movieLanguage: "Hindi",
        quality: ["480p", "720p", "1080p"],
        poster: "https://i.imgur.com/P5cL4pp.jpeg",
        screenshots: [
            "https://i.imgur.com/3Q1JJoE.jpg",
            "https://i.imgur.com/uXjlzJq.jpg",
            "https://i.imgur.com/a1z9HkR.jpg",
        ],
        qualityLinks: {
            "480p": "https://drive.google.com/480plink",
            "720p": "https://drive.google.com/720plink",
            "1080p": "https://drive.google.com/1080plink",
        },
    });
    res.send("✅ Dummy movie added!");
});

// Movie Details Page
app.get("/movies/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");

        const suggestions = await Movie.find({
            _id: { $ne: movie._id },
            $or: [
                { genre: { $in: movie.genre } },
                { movieLanguage: movie.movieLanguage },
            ],
        }).limit(6);

        res.render("details", { movie, suggestions });
    } catch (err) {
        res.status(500).send("Something went wrong");
    }
});

// Enhanced Download Page
app.get("/movies/download/:id", async(req, res) => {
    try {
        const movieId = req.params.id;
        const movie = await Movie.findById(movieId).lean();

        if (!movie) {
            return res.status(404).render("error", {
                message: "Movie not found",
                statusCode: 404,
            });
        }

        if (!movie.qualityLinks || Object.keys(movie.qualityLinks).length === 0) {
            return res.status(400).render("error", {
                message: "No download links found for this movie.",
                statusCode: 400,
            });
        }

        res.render("download", { movie });
    } catch (err) {
        console.error("🚨 Error rendering download page:", err);
        return res.status(500).render("error", {
            message: "Internal Server Error",
            statusCode: 500,
        });
    }
});

// Admin: Add Movie (Form)
app.get("/admin/add", (req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    res.render("add", { adminQuery: req.query.admin });
});

// Admin: Add Movie (Handler)
app.post("/admin/add", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const { screenshots } = req.body;
        const validScreenshots = Array.isArray(screenshots) ?
            screenshots.filter((s) => s.trim() !== "") :
            screenshots ? [screenshots.trim()] : [];

        if (validScreenshots.length < 3) {
            return res.status(400).send("❌ Please enter at least 3 screenshots.");
        }

        const movieData = {
            ...req.body,
            cast: req.body.cast ? req.body.cast.split(",").map((s) => s.trim()) : [],
            genre: req.body.genre ?
                req.body.genre.split(",").map((s) => s.trim()) : [],
            quality: req.body.quality ?
                req.body.quality.split(",").map((s) => s.trim()) : [],
            screenshots: validScreenshots,
            qualityLinks: req.body.qualityLinks,
        };

        await Movie.create(movieData);
        res.redirect("/?admin=8892");
    } catch (err) {
        console.error("❌ Failed to add movie:", err.message);
        res.status(500).send("Failed to add movie");
    }
});



// Admin: Edit Movie (Form)
app.get("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).send("Movie not found");
    res.render("edit", { movie, adminQuery: req.query.admin });
});

// Admin: Edit Movie (Handler)
app.post("/admin/edit/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");

    try {
        const { screenshots } = req.body;
        const validScreenshots = Array.isArray(screenshots) ?
            screenshots.filter((s) => s.trim()) :
            screenshots ? [screenshots.trim()] : [];

        const updatedData = {
            ...req.body,
            cast: req.body.cast ? req.body.cast.split(",").map((s) => s.trim()) : [],
            genre: req.body.genre ?
                req.body.genre.split(",").map((s) => s.trim()) : [],
            quality: req.body.quality ?
                req.body.quality.split(",").map((s) => s.trim()) : [],
            screenshots: validScreenshots,
            qualityLinks: req.body.qualityLinks,
        };

        await Movie.findByIdAndUpdate(req.params.id, updatedData);
        res.redirect("/?admin=8892");
    } catch (err) {
        res.status(500).send("Failed to update movie");
    }
});

// Admin: Delete Movie
app.get("/admin/delete/:id", async(req, res) => {
    if (!res.locals.isAdmin) return res.redirect("/");
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect("/?admin=8892");
});

// Static Pages
app.get("/about-us", (req, res) => res.render("about"));
app.get("/privacy-policy", (req, res) => res.render("privacy"));

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});