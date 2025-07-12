// app.js
import express from "express";
import mongoose from "mongoose";
import path from "path";
import Movie from "./models/movies.js";
import adminAuth from "./middleware/adminAuth.js";
import bodyParser from "body-parser";

const app = express();
const PORT = 3000;
const __dirname = path.resolve();

// Middlewares
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(adminAuth); // ✅ this adds isAdmin to all templates

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/movieshub")
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

// ✅ Unified Home Route
app.get("/", async(req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const searchQuery = req.query.search || "";
        const category = req.query.category;

        const query = {
            ...(searchQuery && { title: { $regex: searchQuery, $options: "i" } }),
            ...(category && category !== "All Movies" && { genre: { $regex: category, $options: "i" } })
        };

        const movies = await Movie.find(query).skip((page - 1) * limit).limit(limit);
        const totalMovies = await Movie.countDocuments(query);
        const totalPages = Math.ceil(totalMovies / limit);
        const trendingMovies = await Movie.find().sort({ createdAt: -1 }).limit(4);

        res.render("home", {
            movies,
            trendingMovies,
            currentPage: page,
            totalPages,
            searchQuery
        });
    } catch (err) {
        res.status(500).send("Error loading homepage");
    }
});

// Dummy Data Seeder
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
            "https://i.imgur.com/uXjlzJq.jpg"
        ],
        qualityLinks: {
            "480p": "https://drive.google.com/480plink",
            "720p": "https://drive.google.com/720plink",
            "1080p": "https://drive.google.com/1080plink"
        }
    });
    res.send("✅ Dummy movie added!");
});

// Movie Details Page with Suggestions
app.get("/movies/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");

        const suggestions = await Movie.find({
            _id: { $ne: movie._id },
            $or: [
                { genre: { $in: movie.genre } },
                { movieLanguage: movie.movieLanguage }
            ]
        }).limit(6);

        res.render("details", { movie, suggestions });
    } catch (err) {
        res.status(500).send("Something went wrong");
    }
});

// Download page
app.get("/download/:id", async(req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");
        res.render("download", { movie });
    } catch (err) {
        res.status(500).send("Error loading download page");
    }
});

// Admin: Add Movie
app.get("/admin/add", adminAuth, (req, res) => {
    res.render("add");
});

app.post("/admin/add", adminAuth, async(req, res) => {
    try {
        const movieData = {
            ...req.body,
            cast: req.body.cast.split(","),
            genre: req.body.genre.split(","),
            quality: req.body.quality.split(","),
            screenshots: req.body.screenshots.split(",")
        };
        await Movie.create(movieData);
        res.redirect("/");
    } catch (err) {
        res.status(500).send("Failed to add movie");
    }
});

// Admin: Edit Movie
app.get("/admin/edit/:id", adminAuth, async(req, res) => {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).send("Movie not found");
    res.render("edit", { movie });
});

app.post("/admin/edit/:id", adminAuth, async(req, res) => {
    try {
        const updatedData = {
            ...req.body,
            cast: req.body.cast.split(","),
            genre: req.body.genre.split(","),
            quality: req.body.quality.split(","),
            screenshots: req.body.screenshots.split(",")
        };
        await Movie.findByIdAndUpdate(req.params.id, updatedData);
        res.redirect("/");
    } catch (err) {
        res.status(500).send("Failed to update movie");
    }
});

// Admin: Delete Movie
app.get("/admin/delete/:id", adminAuth, async(req, res) => {
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect("/");
});

// Static pages
app.get("/about-us", (req, res) => {
    res.render("about");
});

app.get("/privacy-policy", (req, res) => {
    res.render("privacy");
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});