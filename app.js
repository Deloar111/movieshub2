// app.js - ENHANCED VERSION WITH 4 TELEGRAM BOTS AND OFFLINE SUPPORT
import express from "express";
import mongoose from "mongoose";
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import path from "path";
import bodyParser from "body-parser";
import lodash from "lodash";
import fs from 'fs';

const { escapeRegExp } = lodash;
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

// ============================
// 🔧 MOVIE SCHEMA DEFINITION
// ============================
const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    cast: [String],
    genre: [String],
    movieLanguage: String,
    quality: [String],
    poster: String,
    screenshots: [String],
    year: { type: Number, default: () => new Date().getFullYear() },
    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    qualityLinks: {
        type: Map,
        of: String,
        default: () => new Map()
    }
}, {
    timestamps: true
});

const Movie = mongoose.model("Movie", movieSchema);

// ============================
// 🔐 ADMIN AUTHENTICATION MIDDLEWARE
// ============================
function adminAuth(req, res, next) {
    try {
        const adminQuery = req.query.admin;
        const adminPassword = "8892"; // Change this to your desired admin password

        // Check if admin parameter matches
        const isAdmin = adminQuery === adminPassword;

        console.log(`🔐 Admin auth check: Query="${adminQuery}", IsAdmin=${isAdmin}`);

        res.locals.isAdmin = isAdmin;
        next();
    } catch (err) {
        console.error('❌ AdminAuth error:', err.message);
        res.locals.isAdmin = false;
        next();
    }
}

// 📁 OFFLINE MOVIE STORAGE SETUP
// ============================
const moviesBackupFile = path.join(__dirname, 'movies_backup.json');
const configFile = path.join(__dirname, 'config.json');
let offlineMovies = [];
let isMongoConnected = false;
let useOfflineMode = false;

// Load movies from backup file
function loadMoviesFromFile() {
    try {
        if (fs.existsSync(moviesBackupFile)) {
            const data = fs.readFileSync(moviesBackupFile, 'utf8');
            const parsed = JSON.parse(data);
            offlineMovies = Array.isArray(parsed) ? parsed : [];
            console.log(`📁 Loaded ${offlineMovies.length} movies from backup file`);
            return true;
        } else {
            console.log('📁 No movies backup file found, creating empty backup');
            offlineMovies = [];
            saveMoviesToFile(); // Create empty file
        }
    } catch (error) {
        console.error('❌ Error loading movies from file:', error);
        offlineMovies = [];
    }
    return false;
}

// Save movies to backup file
function saveMoviesToFile() {
    try {
        fs.writeFileSync(moviesBackupFile, JSON.stringify(offlineMovies, null, 2));
        console.log(`💾 Saved ${offlineMovies.length} movies to backup file`);
    } catch (error) {
        console.error('❌ Error saving movies to file:', error);
    }
}

// Sync movies from MongoDB to backup file
async function syncMoviesToFile() {
    try {
        if (isMongoConnected) {
            const mongoMovies = await Movie.find({}).lean();
            offlineMovies = mongoMovies.map(movie => ({
                ...movie,
                _id: movie._id.toString(),
                qualityLinks: movie.qualityLinks || {}
            }));
            saveMoviesToFile();
            console.log(`🔄 Synced ${offlineMovies.length} movies from MongoDB to backup file`);
        }
    } catch (error) {
        console.error('❌ Error syncing movies to file:', error);
    }
}

// ENHANCED: Offline search function
function searchMoviesOffline(query) {
    if (!query || !query.trim()) {
        console.log('📋 Returning all offline movies (no search query)');
        return offlineMovies.slice(0, 20);
    }

    const searchTerm = query.toLowerCase().trim();
    console.log(`🔍 Searching offline movies for: "${searchTerm}"`);
    console.log(`📚 Total offline movies available: ${offlineMovies.length}`);

    if (!Array.isArray(offlineMovies) || offlineMovies.length === 0) {
        console.log('📚 No offline movies available');
        return [];
    }

    const results = offlineMovies.filter(movie => {
        if (!movie) return false;

        const titleMatch = movie.title && movie.title.toLowerCase().includes(searchTerm);
        const descriptionMatch = movie.description && movie.description.toLowerCase().includes(searchTerm);

        // Handle cast array properly
        const castMatch = Array.isArray(movie.cast) &&
            movie.cast.some(actor =>
                actor && typeof actor === 'string' && actor.toLowerCase().includes(searchTerm)
            );

        // Handle genre array properly
        const genreMatch = Array.isArray(movie.genre) &&
            movie.genre.some(g =>
                g && typeof g === 'string' && g.toLowerCase().includes(searchTerm)
            );

        // Language match
        const languageMatch = movie.movieLanguage &&
            movie.movieLanguage.toLowerCase().includes(searchTerm);

        return titleMatch || descriptionMatch || castMatch || genreMatch || languageMatch;
    });

    console.log(`🎯 Found ${results.length} matching movies offline`);
    return results.slice(0, 20);
}

// ============================
// 🤖 MULTI-BOT TELEGRAM SETUP (NEW ENHANCED VERSION)
// ============================

// Bot configurations with your tokens
const BOT_CONFIGS = [{
        name: 'Movieshub',
        username: '@Mhubsbot',
        token: '7948443317:AAGbzpq__Bl3eNJd8J1xSf5XqcR1heITyhY',
        description: 'Your go-to movie hub for the latest films!'
    },
    {
        name: 'Moviemods',
        username: '@Moviemodsbot',
        token: '7682450259:AAHdtvmumVrOFWe4ytxqodh_1k-ooD9rHYk',
        description: 'Modified movie experiences and premium content!'
    },
    {
        name: 'Moveshub',
        username: '@Movhubsbot',
        token: '8371835477:AAFejQlDZhkS4muunXPRvi2mA-J8VGn8TxM',
        description: 'Your central hub for all movie downloads!'
    },
    {
        name: 'Movieshubbot',
        username: '@movhubs_bot',
        token: '7965399127:AAH_4SSjYKZshPMl1Cvouu9SS3naJpvi6m0',
        description: 'Ultimate movie collection at your fingertips!'
    }
];

const NOTIFICATION_CHAT_ID = 6375810452;
const WEBSITE_URL = 'https://moviemods.onrender.com';

// Store all bot instances
let bots = [];
let activeBots = [];

// ============================
// 🔧 MIDDLEWARE SETUP
// ============================
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

// FIXED: Admin authentication middleware
app.use((req, res, next) => {
    try {
        adminAuth(req, res, next);
    } catch (err) {
        console.log('⚠️ AdminAuth middleware error:', err.message);
        res.locals.isAdmin = false;
        next();
    }
});

// ============================
// 🌐 SEO & STATIC ROUTES
// ============================
app.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${WEBSITE_URL}/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>`);
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ============================
// 🔗 MONGODB CONNECTION (ENHANCED)
// ============================
const connectDB = async() => {
    try {
        const mongoUrl = process.env.MONGO_URL ||
            "mongodb+srv://deloarhossen:8PwxJE5xWkALIPK@watchview.x1xjpmm.mongodb.net/watchview?retryWrites=true&w=majority&appName=watchview";

        await mongoose.connect(mongoUrl);
        isMongoConnected = true;
        console.log("✅ MongoDB Connected Successfully");

        const movieCount = await Movie.countDocuments();
        console.log(`📊 Current movies in database: ${movieCount}`);

        // Sync movies to backup file
        await syncMoviesToFile();

        // Start bot watchers and listeners after DB connection
        await initializeAllBots();

    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        isMongoConnected = false;
        useOfflineMode = true;

        // Load from backup file if MongoDB fails
        const loaded = loadMoviesFromFile();
        console.log(`🔴 Using offline mode with backup file (${offlineMovies.length} movies loaded)`);

        // Start bots even in offline mode
        await initializeAllBots();
    }
};

// ============================
// 🤖 ENHANCED MULTI-BOT FUNCTIONS
// ============================

// Initialize all bots
async function initializeAllBots() {
    console.log(`🤖 Initializing ${BOT_CONFIGS.length} Telegram bots...`);

    for (const config of BOT_CONFIGS) {
        try {
            const bot = new TelegramBot(config.token, { polling: true });

            // Store bot info
            const botInfo = {
                ...config,
                bot: bot,
                isActive: false
            };

            bots.push(botInfo);

            // Set up bot commands and handlers
            await setupBotHandlers(botInfo);

            console.log(`✅ Bot ${config.name} (${config.username}) initialized`);

        } catch (error) {
            console.error(`❌ Failed to initialize bot ${config.name}:`, error.message);
        }
    }

    console.log(`🎉 ${bots.length} bots initialized successfully`);

    // Send status to notification channel
    if (bots.length > 0) {
        await sendMultiBotNotification('🤖 All Movie Bots are now active!');
    }

    // Set up new movie watcher if MongoDB is connected
    if (isMongoConnected) {
        await startMovieWatcher();
    }
}

// Setup handlers for individual bot
async function setupBotHandlers(botInfo) {
    const { bot, name, username, description } = botInfo;

    // Start command
    bot.onText(/\/start/, async(msg) => {
        const chatId = msg.chat.id;
        const status = isMongoConnected ? '🟢 Online' : '🔴 Offline';
        const movieCount = isMongoConnected ? 'Loading...' : offlineMovies.length;

        const welcomeMessage = `🎬 Welcome to ${name}!\n${description}\n\n` +
            `Status: ${status}\n` +
            `Available Movies: ${movieCount}\n\n` +
            `🔍 Just type a movie name to search\n` +
            `📋 /list - Show recent movies\n` +
            `ℹ️ /status - Check bot status\n` +
            `🌐 /website - Visit our website\n\n` +
            `Example: Type "Pushpa" or "RRR"`;

        try {
            await bot.sendMessage(chatId, welcomeMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌐 Visit Website', url: WEBSITE_URL }],
                        [{ text: '🔍 Search Movies', callback_data: 'search_help' }]
                    ]
                },
                parse_mode: 'Markdown'
            });

            console.log(`📨 Welcome message sent via ${name} to ${chatId}`);
        } catch (error) {
            console.error(`❌ Error sending welcome message via ${name}:`, error.message);
        }
    });

    // Status command
    bot.onText(/\/status/, async(msg) => {
        const chatId = msg.chat.id;
        const status = isMongoConnected ? '🟢 Online (MongoDB)' : '🔴 Offline (Backup file)';
        const movieCount = isMongoConnected ? 'Fetching...' : offlineMovies.length;

        const statusMessage = `🤖 Bot: ${name}\n` +
            `Status: ${status}\n` +
            `Movies Available: ${movieCount}\n` +
            `Last Updated: ${new Date().toLocaleString()}\n` +
            `Website: ${WEBSITE_URL}`;

        try {
            await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`❌ Status command error via ${name}:`, error.message);
        }
    });

    // List command
    bot.onText(/\/list/, async(msg) => {
        const chatId = msg.chat.id;

        try {
            let movies = [];

            if (isMongoConnected) {
                movies = await Movie.find().sort({ createdAt: -1 }).limit(10);
            } else {
                movies = offlineMovies.slice(0, 10);
            }

            if (movies.length === 0) {
                return await bot.sendMessage(chatId, `❌ No movies available via ${name}`);
            }

            let response = `📚 Recent Movies (${movies.length}) - ${name}:\n\n`;

            movies.forEach((movie, index) => {
                response += `${index + 1}. 🎥 ${movie.title}`;
                if (movie.year) response += ` (${movie.year})`;
                if (movie.movieLanguage) response += ` - ${movie.movieLanguage}`;
                response += `\n`;
            });

            response += `\n💡 Type any movie name to search!`;

            await bot.sendMessage(chatId, response);

        } catch (error) {
            console.error(`❌ List command error via ${name}:`, error.message);
            await bot.sendMessage(chatId, '⚠️ Error loading movie list');
        }
    });

    // Website command
    bot.onText(/\/website/, async(msg) => {
        const chatId = msg.chat.id;

        try {
            await bot.sendMessage(chatId, `🌐 Visit our website: ${WEBSITE_URL}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌐 Open Website', url: WEBSITE_URL }]
                    ]
                }
            });
        } catch (error) {
            console.error(`❌ Website command error via ${name}:`, error.message);
        }
    });

    // Main search functionality
    bot.on('message', async(msg) => {
        const chatId = msg.chat.id;
        const query = typeof msg.text === 'string' ? msg.text.trim() : '';

        // Ignore empty or command messages
        if (!query || query.startsWith('/')) return;

        console.log(`🔍 Search query via ${name} from ${chatId}: "${query}" (Mode: ${isMongoConnected ? 'Online' : 'Offline'})`);

        try {
            let results = [];

            if (isMongoConnected) {
                // Online search - use MongoDB
                const escapedSearch = escapeRegExp(query);
                const searchFilter = {
                    $or: [
                        { title: { $regex: escapedSearch, $options: "i" } },
                        { description: { $regex: escapedSearch, $options: "i" } },
                        { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                        { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                    ]
                };

                results = await Movie.find(searchFilter).limit(5).sort({ createdAt: -1 });
            } else {
                // Offline search - use backup file
                results = searchMoviesOffline(query).slice(0, 5);
            }

            if (!results || results.length === 0) {
                const noResultsMessage = `❌ No results found for *${query}* via ${name}\n\n` +
                    `💡 Try different keywords like:\n` +
                    `• Movie title (e.g., "Pushpa", "RRR")\n` +
                    `• Actor name (e.g., "Allu Arjun")\n` +
                    `• Genre (e.g., "Action", "Comedy")\n\n` +
                    `🔴 Mode: ${isMongoConnected ? 'Online' : 'Offline'} | Movies: ${isMongoConnected ? 'Loading...' : offlineMovies.length}`;

                return await bot.sendMessage(chatId, noResultsMessage, { parse_mode: 'Markdown' });
            }

            const mode = isMongoConnected ? '🟢' : '🔴';
            await bot.sendMessage(chatId, `${mode} Found ${results.length} result(s) for *${query}* via ${name}:`, { parse_mode: 'Markdown' });

            for (const movie of results) {
                const title = movie.title || 'Untitled';
                const year = movie.year || 'N/A';
                const genre = Array.isArray(movie.genre) ? movie.genre.join(', ') : (movie.genre || 'N/A');
                const language = movie.movieLanguage || 'N/A';
                const poster = movie.poster;
                const movieId = movie._id.toString();
                const link = `${WEBSITE_URL}/movies/download/${movieId}`;

                const caption = [
                    `🎬 *${title}*`,
                    `📅 Year: ${year}`,
                    `🎭 Genre: ${genre}`,
                    `🌐 Language: ${language}`,
                    `🤖 Bot: ${name}`,
                    `📥 [Download Movie](${link})`
                ].join('\n');

                try {
                    if (poster && poster.startsWith('http')) {
                        await bot.sendPhoto(chatId, poster, {
                            caption,
                            parse_mode: 'Markdown'
                        });
                    } else {
                        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
                    }
                } catch (photoError) {
                    // If photo fails, send text message
                    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
                }

                // Small delay to avoid flooding
                await new Promise(resolve => setTimeout(resolve, 500));
            }

        } catch (error) {
            console.error(`❌ Bot search error via ${name}:`, error.message);
            await bot.sendMessage(chatId, `⚠️ Search error via ${name}. Please try again later.`);
        }
    });

    // Handle callback queries (inline buttons)
    bot.on('callback_query', async(query) => {
        const chatId = query.message.chat.id;

        if (query.data === 'search_help') {
            const helpMessage = `🔍 How to search movies via ${name}:\n\n` +
                `1️⃣ Type any movie name\n` +
                `2️⃣ Get instant results\n` +
                `3️⃣ Click download links\n\n` +
                `Examples:\n` +
                `• Pushpa 2\n` +
                `• RRR\n` +
                `• KGF\n` +
                `• Bahubali\n\n` +
                `💡 You can also search by actor or genre!`;

            try {
                await bot.sendMessage(chatId, helpMessage);
                await bot.answerCallbackQuery(query.id);
            } catch (error) {
                console.error(`❌ Callback query error via ${name}:`, error.message);
            }
        }
    });

    // Mark bot as active
    botInfo.isActive = true;
    activeBots.push(botInfo);
}

// Send notification to all active bots
async function sendMultiBotNotification(message) {
    try {
        if (activeBots.length > 0) {
            // Send to the first active bot's notification channel
            const firstBot = activeBots[0];
            await firstBot.bot.sendMessage(NOTIFICATION_CHAT_ID,
                `${message}\n\n🤖 Active Bots: ${activeBots.length}\n` +
                activeBots.map(b => `• ${b.name} (${b.username})`).join('\n')
            );
        }
    } catch (error) {
        console.error('❌ Multi-bot notification error:', error.message);
    }
}

// Movie watcher for new movie notifications
async function startMovieWatcher() {
    if (!isMongoConnected) {
        console.log('🔴 MongoDB not connected - skipping movie watcher');
        return;
    }

    try {
        console.log('🤖 Starting movie watcher for all bots...');
        await sendMultiBotNotification('🎬 Movie watcher is now active across all bots!');

        const changeStream = Movie.watch();

        changeStream.on('change', async(data) => {
            console.log('📡 Database change detected:', data.operationType);

            if (data.operationType === 'insert') {
                const movie = data.fullDocument;
                console.log(`🎬 New movie added: ${movie.title}`);

                // Add to offline backup
                const movieForBackup = {
                    ...movie,
                    _id: movie._id.toString(),
                    qualityLinks: typeof movie.qualityLinks === 'object' ? movie.qualityLinks : {}
                };
                offlineMovies.unshift(movieForBackup);
                saveMoviesToFile();

                const link = `${WEBSITE_URL}/movies/download/${movie._id}`;
                const genre = Array.isArray(movie.genre) ? movie.genre.join(', ') : movie.genre || 'N/A';
                const language = movie.movieLanguage || 'N/A';
                const year = movie.year || 'N/A';
                const title = movie.title || 'Untitled';

                const caption = `🆕 *New Movie Added!*\n\n` +
                    `🎬 *${title}*\n` +
                    `📅 Year: ${year}\n` +
                    `🎭 Genre: ${genre}\n` +
                    `🌐 Language: ${language}\n` +
                    `📥 [Download Movie](${link})`;

                // Send notification via all active bots
                for (const botInfo of activeBots) {
                    try {
                        if (movie.poster && movie.poster.startsWith('http')) {
                            await botInfo.bot.sendPhoto(NOTIFICATION_CHAT_ID, movie.poster, {
                                caption: caption + `\n\n🤖 Via: ${botInfo.name}`,
                                parse_mode: 'Markdown'
                            });
                        } else {
                            await botInfo.bot.sendMessage(NOTIFICATION_CHAT_ID,
                                caption + `\n\n🤖 Via: ${botInfo.name}`, { parse_mode: 'Markdown' }
                            );
                        }

                        console.log(`✅ New movie notification sent via ${botInfo.name}`);

                        // Delay between bots to avoid spam
                        await new Promise(resolve => setTimeout(resolve, 1000));

                    } catch (err) {
                        console.error(`❌ Notification error via ${botInfo.name}:`, err.message);
                    }
                }
            }
        });

        changeStream.on('error', (error) => {
            console.error('❌ Change stream error:', error);
        });

    } catch (error) {
        console.error('❌ Movie watcher error:', error.message);
    }
}

// ============================
// 🔍 API ENDPOINTS (SAME AS BEFORE)
// ============================

// API endpoint for movie search
app.get("/api/search", async(req, res) => {
    try {
        const query = req.query.q || '';

        console.log(`🔍 API Search query: "${query}" (Mode: ${isMongoConnected ? 'Online' : 'Offline'})`);

        if (!query.trim()) {
            console.log('📋 Empty search query, returning empty array');
            return res.json([]);
        }

        let movies = [];

        if (isMongoConnected) {
            // Online search
            const escapedSearch = escapeRegExp(query);
            const searchFilter = {
                $or: [
                    { title: { $regex: escapedSearch, $options: "i" } },
                    { description: { $regex: escapedSearch, $options: "i" } },
                    { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                    { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                ]
            };

            movies = await Movie.find(searchFilter).sort({ createdAt: -1 }).limit(20);
        } else {
            // Offline search
            movies = searchMoviesOffline(query);
        }

        console.log(`📊 API Search results: ${movies.length} movies found`);
        res.json(movies);

    } catch (err) {
        console.error("❌ API Search Error:", err);
        res.status(500).json({ error: "Search failed" });
    }
});

// API endpoint to get all movies
app.get("/api/movies", async(req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let movies = [];
        let total = 0;

        if (isMongoConnected) {
            movies = await Movie.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
            total = await Movie.countDocuments();
        } else {
            total = offlineMovies.length;
            movies = offlineMovies.slice(skip, skip + limit);
        }

        res.json({
            movies,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalMovies: total
            },
            mode: isMongoConnected ? 'online' : 'offline',
            activeBots: activeBots.length
        });

    } catch (err) {
        console.error("❌ API Movies Error:", err);
        res.status(500).json({ error: "Failed to fetch movies" });
    }
});

// ============================
// 🏠 HOMEPAGE (SAME AS BEFORE BUT WITH BOT INFO)
// ============================
app.get("/", async(req, res) => {
    try {
        console.log("📥 Homepage request received");
        console.log(`🔧 Mode: ${isMongoConnected ? 'Online' : 'Offline'} | Movies available: ${isMongoConnected ? 'Loading...' : offlineMovies.length}`);
        console.log(`🤖 Active bots: ${activeBots.length}`);

        const page = parseInt(req.query.page) || 1;
        const limit = 14;
        const searchQuery = (req.query.search || "").trim();
        const category = req.query.category;

        let movies = [];
        let totalMovies = 0;

        if (isMongoConnected) {
            // Use MongoDB logic (original code)
            if (searchQuery) {
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

                movies = await Movie.find(searchFilter)
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit);

                totalMovies = await Movie.countDocuments(searchFilter);
            } else {
                const query = {};
                if (category && category !== "All Movies") {
                    query.genre = { $regex: category, $options: "i" };
                }

                if (req.query.admin === "8892") {
                    movies = await Movie.find(query).sort({ createdAt: -1 });
                    totalMovies = movies.length;
                } else {
                    totalMovies = await Movie.countDocuments(query);
                    movies = await Movie.find(query)
                        .sort({ createdAt: -1 })
                        .skip((page - 1) * limit)
                        .limit(limit);
                }
            }
        } else {
            // Use offline mode
            console.log("🔴 Using offline mode for homepage");
            console.log(`📚 Available offline movies: ${offlineMovies.length}`);

            let filteredMovies = [...offlineMovies];

            if (searchQuery) {
                console.log(`🔍 Performing offline search for: "${searchQuery}"`);
                filteredMovies = searchMoviesOffline(searchQuery);
            }

            if (category && category !== "All Movies") {
                console.log(`📂 Filtering offline movies by category: ${category}`);
                filteredMovies = filteredMovies.filter(movie =>
                    movie.genre && Array.isArray(movie.genre) &&
                    movie.genre.some(g => g && g.toLowerCase().includes(category.toLowerCase()))
                );
            }

            totalMovies = filteredMovies.length;
            const skip = (page - 1) * limit;
            movies = filteredMovies.slice(skip, skip + limit);
        }

        const totalPages = Math.ceil(totalMovies / limit);

        // Get trending movies
        const trendingMovies = !searchQuery && !category ?
            (isMongoConnected ?
                await Movie.find().sort({ createdAt: -1 }).limit(4) :
                offlineMovies.slice(0, 4)
            ) : [];

        res.render("home", {
            movies,
            trendingMovies,
            currentPage: page,
            totalPages,
            searchQuery,
            category,
            isAdmin: res.locals.isAdmin || false,
            isOffline: !isMongoConnected,
            totalMovies: totalMovies,
            activeBots: activeBots.length,
            botList: activeBots.map(b => ({ name: b.name, username: b.username }))
        });

    } catch (err) {
        console.error("❌ Homepage Error:", err);
        res.status(500).render("error", {
            message: "Error loading homepage: " + err.message,
            statusCode: 500
        });
    }
});

// ============================
// 🤖 BOT MANAGEMENT ROUTES
// ============================

// Bot status page
app.get("/bot", (req, res) => {
    const botStats = activeBots.map(botInfo => ({
        name: botInfo.name,
        username: botInfo.username,
        description: botInfo.description,
        isActive: botInfo.isActive,
        status: botInfo.isActive ? '🟢 Active' : '🔴 Inactive'
    }));

    res.render("bot", {
        isAdmin: res.locals.isAdmin || false,
        botStats,
        totalBots: BOT_CONFIGS.length,
        activeBots: activeBots.length,
        isOffline: !isMongoConnected,
        movieCount: isMongoConnected ? 'Loading...' : offlineMovies.length
    });
});

// API endpoint to get bot status
app.get("/api/bots", (req, res) => {
    const botStats = bots.map(botInfo => ({
        name: botInfo.name,
        username: botInfo.username,
        description: botInfo.description,
        isActive: botInfo.isActive,
        status: botInfo.isActive ? 'active' : 'inactive'
    }));

    res.json({
        totalBots: BOT_CONFIGS.length,
        activeBots: activeBots.length,
        inactiveBots: BOT_CONFIGS.length - activeBots.length,
        bots: botStats,
        mode: isMongoConnected ? 'online' : 'offline',
        movieCount: isMongoConnected ? 'loading' : offlineMovies.length
    });
});

// ============================
// REST OF YOUR ROUTES (ADMIN, MOVIE DETAILS, ETC.)
// ============================

// Initialize everything
async function initializeApp() {
    console.log('🚀 Initializing Multi-Bot MovieMods App...');

    // First load offline backup
    const loaded = loadMoviesFromFile();
    console.log(`📁 Offline backup status: ${loaded ? 'Loaded' : 'Empty'} (${offlineMovies.length} movies)`);

    // Then try to connect to MongoDB
    await connectDB();

    console.log(`🎬 App initialized in ${isMongoConnected ? 'Online' : 'Offline'} mode`);
    console.log(`📚 Movies available: ${isMongoConnected ? 'Loading from DB...' : offlineMovies.length}`);
    console.log(`🤖 Bots configured: ${BOT_CONFIGS.length}`);
}

// Admin routes
app.get("/admin/add", (req, res) => {
    if (!res.locals.isAdmin) {
        return res.redirect("/");
    }

    res.render("add", {
        errors: [],
        success: null,
        adminQuery: req.query.admin,
        activeBots: activeBots.length
    });
});

app.post("/admin/add", async(req, res) => {
    if (!res.locals.isAdmin) {
        return res.redirect("/");
    }

    try {
        const movieData = {
            title: typeof req.body.title === 'string' ? req.body.title.trim() : "",
            description: typeof req.body.description === 'string' ? req.body.description.trim() : "",
            year: parseInt(req.body.year) || new Date().getFullYear(),
            views: parseInt(req.body.views) || 0,
            downloads: parseInt(req.body.downloads) || 0,
            cast: typeof req.body.cast === 'string' ? req.body.cast.split(',').map(x => x.trim()).filter(Boolean) : [],
            genre: Array.isArray(req.body.genre) ? req.body.genre.map(g => g.trim()) : [],
            movieLanguage: typeof req.body.movieLanguage === 'string' ? req.body.movieLanguage.trim() : "",
            quality: Array.isArray(req.body.quality) ? req.body.quality.map(q => q.trim()) : [],
            poster: typeof req.body.poster === 'string' ? req.body.poster.trim() : "",
            screenshots: Array.isArray(req.body.screenshots) ? req.body.screenshots.map(s => s.trim()).filter(Boolean) : [],
            qualityLinks: {}
        };

        // Handle quality links
        if (req.body.qualityLinks && typeof req.body.qualityLinks === 'object') {
            for (const [quality, link] of Object.entries(req.body.qualityLinks)) {
                if (link && typeof link === 'string' && link.trim().length > 0) {
                    movieData.qualityLinks[quality] = link.trim();
                }
            }
        }

        const errors = [];
        if (!movieData.title) errors.push({ msg: "Title is required" });
        if (!movieData.description || movieData.description.length < 10) {
            errors.push({ msg: "Description must be at least 10 characters" });
        }
        if (!movieData.movieLanguage) errors.push({ msg: "Language is required" });
        if (!movieData.genre || movieData.genre.length === 0) {
            errors.push({ msg: "At least one genre is required" });
        }

        if (errors.length > 0) {
            return res.render("add", {
                errors,
                success: null,
                adminQuery: req.query.admin,
                activeBots: activeBots.length
            });
        }

        if (isMongoConnected) {
            const newMovie = new Movie(movieData);
            const savedMovie = await newMovie.save();
            console.log("✅ Movie saved to MongoDB with ID:", savedMovie._id);

            // Also add to offline backup
            const movieForBackup = {
                ...savedMovie.toObject(),
                _id: savedMovie._id.toString(),
                qualityLinks: savedMovie.qualityLinks ? Object.fromEntries(savedMovie.qualityLinks) : {}
            };
            offlineMovies.unshift(movieForBackup);
            saveMoviesToFile();
        } else {
            // Save to offline backup only
            const newMovieOffline = {
                ...movieData,
                _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            offlineMovies.unshift(newMovieOffline);
            saveMoviesToFile();
            console.log("✅ Movie saved to offline backup");
        }

        const message = isMongoConnected ?
            `🎉 Movie added successfully! All ${activeBots.length} bots will send notifications automatically.` :
            `🎉 Movie added to offline storage! Will sync and notify via ${activeBots.length} bots when database is available.`;

        res.render("add", {
            errors: [],
            success: message,
            adminQuery: req.query.admin,
            activeBots: activeBots.length
        });

    } catch (err) {
        console.error("❌ Error adding movie:", err);
        res.render("add", {
            errors: [{ msg: `Error saving movie: ${err.message}` }],
            success: null,
            adminQuery: req.query.admin,
            activeBots: activeBots.length
        });
    }
});

// Movie details and download (same as before)
app.get("/movies/:id", async(req, res) => {
    try {
        const movieId = req.params.id;
        let movie = null;
        let suggestions = [];

        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            movie = await Movie.findById(movieId);
            if (movie) {
                suggestions = await Movie.find({
                    _id: { $ne: movie._id },
                    $or: [
                        { genre: { $in: movie.genre } },
                        { movieLanguage: movie.movieLanguage },
                    ],
                }).limit(6);
            }
        } else {
            movie = offlineMovies.find(m => m._id === movieId);
            if (movie) {
                suggestions = offlineMovies.filter(m =>
                    m._id !== movieId && (
                        (m.genre && movie.genre && m.genre.some(g => movie.genre.includes(g))) ||
                        m.movieLanguage === movie.movieLanguage
                    )
                ).slice(0, 6);
            }
        }

        if (!movie) {
            return res.status(404).render("error", {
                message: "Movie not found",
                statusCode: 404
            });
        }

        const movieData = movie.toObject ? movie.toObject() : movie;
        if (movieData.qualityLinks && typeof movieData.qualityLinks === 'object') {
            if (movieData.qualityLinks instanceof Map) {
                movieData.qualityLinks = Object.fromEntries(movieData.qualityLinks);
            }
        }

        res.render("details", {
            movie: movieData,
            suggestions,
            isAdmin: res.locals.isAdmin || false,
            activeBots: activeBots.length
        });

    } catch (err) {
        console.error("❌ Error loading movie details:", err);
        res.status(500).render("error", {
            message: "Something went wrong",
            statusCode: 500
        });
    }
});

// Download Page
app.get("/movies/download/:id", async(req, res) => {
    try {
        const movieId = req.params.id;
        let movie = null;

        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            movie = await Movie.findById(movieId).lean();
        } else {
            movie = offlineMovies.find(m => m._id === movieId);
        }

        if (!movie) {
            return res.status(404).render("error", {
                message: "Movie not found",
                statusCode: 404
            });
        }

        let qualityLinks = {};
        if (movie.qualityLinks) {
            if (movie.qualityLinks instanceof Map) {
                qualityLinks = Object.fromEntries(movie.qualityLinks);
            } else if (typeof movie.qualityLinks === 'object') {
                qualityLinks = movie.qualityLinks;
            }
        }

        if (!qualityLinks || Object.keys(qualityLinks).length === 0) {
            return res.status(400).render("error", {
                message: "No download links found for this movie.",
                statusCode: 400
            });
        }

        // Update download count
        if (isMongoConnected && mongoose.Types.ObjectId.isValid(movieId)) {
            await Movie.findByIdAndUpdate(movieId, { $inc: { downloads: 1 } });
        } else {
            const movieIndex = offlineMovies.findIndex(m => m._id === movieId);
            if (movieIndex !== -1) {
                offlineMovies[movieIndex].downloads = (offlineMovies[movieIndex].downloads || 0) + 1;
                saveMoviesToFile();
            }
        }

        res.render("download", {
            movie: {
                ...movie,
                qualityLinks
            },
            isAdmin: res.locals.isAdmin || false,
            activeBots: activeBots.length
        });
    } catch (err) {
        console.error("❌ Error rendering download page:", err);
        res.status(500).render("error", {
            message: "Internal Server Error",
            statusCode: 500
        });
    }
});

// Static pages
app.get("/about-us", (req, res) => {
    res.render("about", {
        isAdmin: res.locals.isAdmin || false,
        activeBots: activeBots.length
    });
});

app.get("/privacy-policy", (req, res) => {
    res.render("privacy", {
        isAdmin: res.locals.isAdmin || false
    });
});

app.get("/dmca", (req, res) => {
    res.render("dmca", {
        isAdmin: res.locals.isAdmin || false
    });
});

// ============================
// 🔧 ENHANCED DEBUG ROUTES
// ============================

// Multi-bot status check
app.get("/debug/multi-bot-status", async(req, res) => {
    try {
        const botDetails = bots.map(botInfo => ({
            name: botInfo.name,
            username: botInfo.username,
            isActive: botInfo.isActive,
            token: botInfo.token ? botInfo.token.substring(0, 10) + '...' : 'Missing'
        }));

        res.json({
            totalConfigured: BOT_CONFIGS.length,
            totalActive: activeBots.length,
            totalInactive: BOT_CONFIGS.length - activeBots.length,
            bots: botDetails,
            database: {
                status: isMongoConnected ? 'Connected' : 'Disconnected',
                movieCount: isMongoConnected ? await Movie.countDocuments() : offlineMovies.length
            },
            offline: {
                moviesLoaded: offlineMovies.length,
                backupFileExists: fs.existsSync(moviesBackupFile)
            }
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

// Test search across all modes
app.get("/debug/test-multi-search", async(req, res) => {
    const query = req.query.q || 'test';

    try {
        let onlineResults = [];
        let offlineResults = [];

        if (isMongoConnected) {
            const escapedSearch = escapeRegExp(query);
            const searchFilter = {
                $or: [
                    { title: { $regex: escapedSearch, $options: "i" } },
                    { description: { $regex: escapedSearch, $options: "i" } },
                    { cast: { $in: [new RegExp(escapedSearch, "i")] } },
                    { genre: { $in: [new RegExp(escapedSearch, "i")] } }
                ]
            };
            onlineResults = await Movie.find(searchFilter).limit(5);
        }

        offlineResults = searchMoviesOffline(query).slice(0, 5);

        res.json({
            query,
            mode: isMongoConnected ? 'Online' : 'Offline',
            activeBots: activeBots.length,
            results: {
                online: {
                    count: onlineResults.length,
                    movies: onlineResults.map(m => ({ id: m._id, title: m.title }))
                },
                offline: {
                    count: offlineResults.length,
                    movies: offlineResults.map(m => ({ id: m._id, title: m.title }))
                }
            },
            botStatus: activeBots.map(b => ({ name: b.name, active: b.isActive }))
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

// ============================
// 🌱 ENHANCED SEEDER
// ============================
app.get("/seed", async(req, res) => {
    try {
        if (req.query.clear === 'true') {
            if (isMongoConnected) {
                await Movie.deleteMany({});
                console.log("🧹 Cleared existing movies from MongoDB");
            }
            offlineMovies = [];
            saveMoviesToFile();
            console.log("🧹 Cleared offline movies");
        }

        const sampleMovies = [{
                title: "Pushpa 2: The Rise",
                description: "Pushpa returns with more action, drama, and intensity in this highly anticipated sequel.",
                cast: ["Allu Arjun", "Rashmika Mandanna", "Fahadh Faasil"],
                genre: ["Action", "Drama", "Thriller"],
                movieLanguage: "Hindi",
                quality: ["480p", "720p", "1080p"],
                year: 2024,
                views: 150000,
                downloads: 25000,
                poster: "https://via.placeholder.com/300x450/FF6B6B/FFFFFF?text=Pushpa+2",
                screenshots: ["https://via.placeholder.com/800x450/FF6B6B/FFFFFF?text=Scene+1"],
                qualityLinks: {
                    "480p": "https://example.com/pushpa2-480p",
                    "720p": "https://example.com/pushpa2-720p",
                    "1080p": "https://example.com/pushpa2-1080p"
                }
            },
            {
                title: "RRR",
                description: "A fictional story about two Indian revolutionaries and their fight against the British Raj.",
                cast: ["N. T. Rama Rao Jr.", "Ram Charan", "Alia Bhatt"],
                genre: ["Action", "Drama", "History"],
                movieLanguage: "Hindi",
                quality: ["720p", "1080p", "4K"],
                year: 2022,
                views: 200000,
                downloads: 35000,
                poster: "https://via.placeholder.com/300x450/96CEB4/FFFFFF?text=RRR",
                screenshots: ["https://via.placeholder.com/800x450/96CEB4/FFFFFF?text=RRR+Scene"],
                qualityLinks: {
                    "720p": "https://example.com/rrr-720p",
                    "1080p": "https://example.com/rrr-1080p",
                    "4K": "https://example.com/rrr-4k"
                }
            }
        ];

        let result = {};

        if (isMongoConnected) {
            const createdMovies = await Movie.insertMany(sampleMovies);
            result.mongodb = {
                success: true,
                count: createdMovies.length
            };
            await syncMoviesToFile();
        } else {
            for (const movieData of sampleMovies) {
                const newMovie = {
                    ...movieData,
                    _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                offlineMovies.unshift(newMovie);
            }
            saveMoviesToFile();
            result.offline = {
                success: true,
                count: sampleMovies.length
            };
        }

        // Send notification via all bots
        if (activeBots.length > 0) {
            await sendMultiBotNotification(`🎬 ${sampleMovies.length} sample movies added to the database!`);
        }

        res.json({
            success: true,
            mode: isMongoConnected ? 'Online' : 'Offline',
            message: `✅ Successfully added ${sampleMovies.length} movies!`,
            activeBots: activeBots.length,
            botNames: activeBots.map(b => b.name),
            ...result
        });

    } catch (err) {
        console.error("❌ Error seeding data:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================
// 🚫 ERROR HANDLING
// ============================
app.use((req, res) => {
    res.status(404).render("404", {
        isAdmin: res.locals.isAdmin || false
    });
});

app.use((err, req, res, next) => {
    console.error("💥 Unhandled error:", err);
    res.status(500).render("error", {
        message: "Something went wrong!",
        statusCode: 500,
        isAdmin: res.locals.isAdmin || false
    });
});

// ============================
// 🚀 START SERVER
// ============================
app.listen(PORT, () => {
    console.log(`🚀 Multi-Bot Movie Server running at http://localhost:${PORT}`);
    console.log(`📱 Configured Bots: ${BOT_CONFIGS.length}`);
    BOT_CONFIGS.forEach((bot, index) => {
        console.log(`   ${index + 1}. ${bot.name} (${bot.username})`);
    });
    console.log(`🔧 Admin access: http://localhost:${PORT}/?admin=8892`);
    console.log(`➕ Add movies: http://localhost:${PORT}/admin/add?admin=8892`);
    console.log(`🤖 Bot status: http://localhost:${PORT}/bot`);
    console.log(`🔧 Multi-bot debug routes:`);
    console.log(`   - GET /debug/multi-bot-status - Check all bot status`);
    console.log(`   - GET /debug/test-multi-search?q=movie - Test search across all modes`);
    console.log(`   - GET /api/bots - Bot API status`);
    console.log(`   - GET /seed - Add sample movies and notify all bots`);

    // Initialize the app
    initializeApp();
});